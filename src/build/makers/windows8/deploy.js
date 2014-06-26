var shell = require('shelljs'),
    q     = require('q');

module.exports = function deploy(path, sha) {
    function log(msg) {
        console.log('[WINDOWS8] [DEPLOY] ' + msg + ' (' + sha + ')');
    }

    function build() {
        var d = q.defer();
        log('compiling the app...');
        // 'restricted' is used to prevent powershell script (part of build.bat) which requires user interaction to run
        var cmd = 'powershell Set-ExecutionPolicy restricted && cordova\\build.bat';
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
        var cmd = 'powershell Set-ExecutionPolicy restricted && cordova\\run.bat --nobuild';
        log(cmd);
        shell.exec(cmd, {silent:true, async:true}, function(code, output) {
            log(output);
            if (code > 0) {
                d.reject('Run failed with code ' + code);
            } else {
                d.resolve();
            }
        });
        return d.promise;
    }

    shell.cd(path);
    return build().then(run);
};
