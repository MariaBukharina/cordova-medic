var shell        = require('shelljs'),
    path         = require('path'),
    n            = require('ncallbacks'),
    fs           = require('fs'),
    mspec        = require('./mobile_spec'),
    couch        = require('../../couchdb/interface'),
    q            = require('q'),
    testRunner   = require('./testRunner'),
    util         = require('util');

module.exports = function(output, sha, entry_point, couchdb_host, test_timeout, build_target) {

    function run() {
        var d = q.defer();
        log('Running app...');
        // the following hack with explorer.exe usage is required to start the tool w/o Admin privileges;
        // in other case there will be the 'app can't open while File Explorer is running with administrator privileges ...' error
        var cmd = (build_target == "store80" || build_target == "phone") ?
            '..\\cordova-cli\\bin\\cordova.cmd run -- --' + build_target :
            '..\\cordova-cli\\bin\\cordova.cmd run',
            logFile = sha + '.log',
            errFile = sha + '.err',
            endFile = sha + '.end',
            runner = 'run.bat';

        // create commands that should be started from bat file:
        //  1. cd to project folder
        //  2. start 'cmd' defined earlier and redirect its stdout and stderr to files
        //  3. print exit code of 'cmd' to 'endfile'
        var runnerContent = util.format('cd /d "%s"\n%s 1>%s 2>%s & echo "%ERRORLEVEL%" >%s',
            shell.pwd(), cmd, logFile, errFile, endFile);
        
        fs.writeFileSync(runner, runnerContent, 'utf-8');
        shell.exec('explorer ' + runner, {async: false});

        // Due to explorer, that don't redirects output of child cmd process
        // and exits immediately after starting bat file we are waiting for
        // special marker - 'endfile' - to be created when cordova run exits.
        var waitForRunner = setInterval(function () {
            if (fs.existsSync(endFile)){
                clearInterval(waitForRunner);
                log(fs.readFileSync(logFile));
                // read 'cordova run' exit code from endfile, that was written by run.bat
                var exitCode = parseInt(fs.readFileSync(endFile, 'utf-8'), 10);
                if (exitCode > 0){
                    log(fs.readFileSync(errFile));
                    d.reject('Unable to run application. Exit code: ' + exitCode);
                }
                d.resolve();
            }
        }, 1000);
        return d.promise;
    }

    function log(msg) {
        console.log('[WINDOWS8] ' + msg + ' (sha: ' + sha + ')');
    }

    function prepareMobileSpec() {
        // make sure windows8 app got created first.
        var defer = q.defer();
        try {
            if (!fs.existsSync(output)) {
                throw new Error('create must have failed as output path does not exist.');
            }
            var mspec_out = path.join(output, 'www');

            log('Modifying Cordova Mobilespec application at:'+mspec_out);

            mspec(mspec_out,sha,'',entry_point, function(err){
                if(err) {
                    throw new Error('Error thrown modifying Windows8 mobile spec application.');
                }

                // specify couchdb server and sha for cordova medic plugin via medic.json
                log('Write medic.json to autotest folder');
                var medic_config='{"sha":"'+sha+'","couchdb":"'+couchdb_host+'"}';
                fs.writeFileSync(path.join(output, '..', '..', 'www','autotest','pages', 'medic.json'),medic_config,'utf-8');

                // Disable file plugin tests due to Mobilespec app failure on windows 8
                var fileToEdit = path.join(output, '..', '..', 'www','autotest','pages', 'all.html');
                if (build_target == "store80" || build_target == "store") {
                    fs.writeFileSync(fileToEdit, fs.readFileSync(fileToEdit, 'utf-8')
                        .replace('<script type="text/javascript" src="../tests/file.tests.js"></script>',
                            '<!-- <script type="text/javascript" src="../tests/file.tests.js"></script> -->'),'utf-8');
                }

                // Disable contacts/device plugin tests on windows phone due to Mobilespec app failure on windows phone 8.1
                if (build_target == "phone"){

                    // Disable tests
                    log('Commenting out device plugin tests in ' + fileToEdit);
                    fs.writeFileSync(fileToEdit, fs.readFileSync(fileToEdit, 'utf-8')
                        .replace('<script type="text/javascript" src="../tests/device.tests.js"></script>',
                            '<!-- <script type="text/javascript" src="../tests/device.tests.js"></script> -->'), 'utf-8');
                    log('Commenting out contacts plugin tests in ' + fileToEdit);
                    fs.writeFileSync(fileToEdit, fs.readFileSync(fileToEdit, 'utf-8')
                        .replace('<script type="text/javascript" src="../tests/contacts.tests.js"></script>',
                            '<!-- <script type="text/javascript" src="../tests/contacts.tests.js"></script> -->'), 'utf-8');
                    
                    // remove dependency element
                    fileToEdit = path.join(output, '..', '..', 'plugins','org.cordova.mobile-spec-dependencies', 'plugin.xml');
                    log('Removing dependency from device plugin in ' + fileToEdit);
                    fs.writeFileSync(fileToEdit, fs.readFileSync(fileToEdit, 'utf-8')
                        .replace('<dependency id="org.apache.cordova.device"/>',
                            '<!--   <dependency id="org.apache.cordova.device"/> -->'),'utf-8');
                    log('Removing dependency from contacts plugin in ' + fileToEdit);
                    fs.writeFileSync(fileToEdit, fs.readFileSync(fileToEdit, 'utf-8')
                        .replace('<dependency id="org.apache.cordova.contacts"/>',
                            '<!--   <dependency id="org.apache.cordova.contacts"/> -->'),'utf-8');
                    
                    // uninstall plugin
                    var cmd = '..\\cordova-cli\\bin\\cordova.cmd plugin rm org.apache.cordova.device';
                    log('Uninstalling device plugin with ' + cmd + ' at ' + shell.pwd());
                    shell.pushd('mobilespec');
                    var command = shell.exec(cmd);
                    shell.popd();
                    if (command.code > 0) {
                        defer.reject('Unable to uninstall org.apache.cordova.device plugin');
                    }
                    
                    cmd = '..\\cordova-cli\\bin\\cordova.cmd plugin rm org.apache.cordova.contacts';
                    log('Uninstalling contacts plugin with ' + cmd + ' at ' + shell.pwd());
                    shell.pushd('mobilespec');
                    command = shell.exec(cmd);
                    shell.popd();
                    if (command.code > 0) {
                        defer.reject('Unable to uninstall org.apache.cordova.contacts plugin');
                    }
                }

                defer.resolve();
            });
        }
        catch (e) {
            defer.reject(e);
        }

        return defer.promise;
    }

    return prepareMobileSpec().then(function() {
            shell.cd(path.join(output, '..', '..'));
            return run();
        }).then(function() {
            return testRunner.waitTestsCompleted(sha, 1000 * test_timeout);
        });
};