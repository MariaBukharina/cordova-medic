var shell = require('shelljs'),
    q     = require('q'),
    fs    = require('fs'),
    path  = require('path');

module.exports = function deploy(platform_path, sha) {
    function log(msg) {
        console.log('[WINDOWS8] [DEPLOY] ' + msg + ' (' + sha + ')');
    }

    function build() {
        var d = q.defer();
        log('compiling the app...');
            // var cmd = 'powershell Set-ExecutionPolicy restricted && cordova\\build.bat';
        // and launch cordova build from there
        var cmd = '..\\cordova-cli\\bin\\cordova.cmd build';
        log(cmd);
        shell.exec(cmd, {silent:true, async:true}, function(code, output) {
            log(output);
            if (code > 0) {
                d.reject('build failed with code ' + code);
            } else {
                d.resolve();
            }
        });
        return d.promise;
    }

    function run() {
        var d = q.defer();
        log('Running app...');
        // the following hack with explorer.exe usage is required to start the tool w/o Admin privileges;
        // in other case there will be the 'app can't open while File Explorer is running with administrator privileges ...' error
        // 'restricted' is used to prevent powershell script (part of build.bat) which requires user interaction to run
        var cmd = '..\\cordova-cli\\bin\\cordova.cmd run --nobuild';
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

    // let's go to app root directory
    shell.cd(path.join(platform_path, '..', '..'));
    return build().then(run);
};
