var shell        = require('shelljs'),
    path         = require('path'),
    n            = require('ncallbacks'),
    fs           = require('fs'),
    mspec        = require('./mobile_spec'),
    couch        = require('../../couchdb/interface'),
    q            = require('q'),
    testRunner   = require('./testRunner');

module.exports = function(output, sha, entry_point, couchdb_host, test_timeout, callback) {

    function run() {
        var d = q.defer();
        log('Running app...');
        // the following hack with explorer.exe usage is required to start the tool w/o Admin privileges;
        // in other case there will be the 'app can't open while File Explorer is running with administrator privileges ...' error
        // 'restricted' is used to prevent powershell script (part of build.bat) which requires user interaction to run
        var cmd = '..\\cordova-cli\\bin\\cordova.cmd run';
            runner = 'run.bat';
        fs.writeFileSync(runner, 'cd /d "' + shell.pwd() + '"\n' + cmd, 'utf-8');
        log(cmd);
        shell.exec('explorer run.bat', {silent:true, async:true}, function(code, output) {
            log(output);
            if (code > 0 && output !== "") {
                d.reject('Unable to run application');
            } else {
                d.resolve();
            }
        });
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
                fs.writeFileSync(
                    path.join(output, '..', '..', 'www','autotest','pages', 'all.html'),
                    fs.readFileSync(path.join(output, '..', '..', 'www','autotest','pages', 'all.html'), 'utf-8')
                        .replace('<script type="text/javascript" src="../tests/file.tests.js"></script>',
                            '<!-- <script type="text/javascript" src="../tests/file.tests.js"></script> -->'),'utf-8');

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
