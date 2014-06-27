var shell        = require('shelljs'),
    path         = require('path'),
    n            = require('ncallbacks'),
    deploy       = require('./windows8/deploy'),
    fs           = require('fs'),
    mspec        = require('./mobile_spec'),
    couch        = require('../../couchdb/interface'),
    q            = require('q');


module.exports = function(output, sha, entry_point, couchdb_host, test_timeout, callback) {

    var packageName = 'org.apache.mobilespec';
    var packageInfo = {};

    function query_for_sha(sha, callback) {

        var view = 'sha?key="' + sha + '"';
        // get build errors from couch for each repo
        couch.mobilespec_results.query_view('results', view, function(error, result) {
            if (error) {
                console.error('query failed for mobilespec_results', error);
                callback(true, error);
                return;
            }
            callback(false, result);
        });
    }

    function isTestsCompleted(sha, callback) {
        query_for_sha(sha, function(isFailed, res) {
            // return True if there is no error and there are test results in db for specified sha
            callback(!isFailed && res.rows.length > 0);
        });
    }

    function waitTestsCompleted(sha, timeoutMs) {
       var defer = q.defer();
       var startTime = Date.now(),
           timeoutTime = startTime + timeoutMs,
           checkInterval = 10 * 1000; // 10 secs

        var testFinishedFn = setInterval(function(){

            isTestsCompleted(sha, function(isSuccess) {
                // if tests are finished or timeout
                if (isSuccess || Date.now() > timeoutTime) {
                    clearInterval(testFinishedFn);
                    isSuccess ? defer.resolve() : defer.reject('timed out');
                }
            });
        }, checkInterval);
        return defer.promise;
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

                log('Modifying Cordova windows8 application.');
                // add the sha to the junit reporter
                var tempJasmine = path.join(output, 'www', 'jasmine-jsreporter.js');
                if (fs.existsSync(tempJasmine)) {
                    fs.writeFileSync(tempJasmine, "var library_sha = '" + sha + "';\n" + fs.readFileSync(tempJasmine, 'utf-8'), 'utf-8');
                }

                //TODO: here should be manifest parsing for phone and store 8.0 also
                var manifestFile = path.join(output, 'package.appxmanifest');
                if (!fs.existsSync(manifestFile)){
                    manifestFile = path.join(output, 'package.store.appxmanifest');
                }
                var manifest = fs.readFileSync(manifestFile).toString().split('\n');
                // set permanent package name to prevent multiple installations
                for (var i in manifest) {
                    if (manifest[i].indexOf('<Identity') != -1) {
                        manifest[i] = manifest[i].replace(/Name=".+?"/gi, 'Name="'+packageName+'"');
                        break;
                    }
                }

                manifest = manifest.join('\n');

                fs.writeFileSync(manifestFile, manifest);

                // var configFile = path.join(output, 'www', 'config.xml');
                var configFile = path.join(output, '..', '..', 'config.xml');
                // modify start page
                fs.writeFileSync(configFile, fs.readFileSync(configFile, 'utf-8').replace(
                    /<content\s*src=".*"/gi, '<content src="' + entry_point.split('www\/').join('') + '"'), 'utf-8');
                // make sure the couch db server is whitelisted
                fs.writeFileSync(configFile, fs.readFileSync(configFile, 'utf-8').replace(
                  /<access origin="http:..audio.ibeat.org" *.>/gi,'<access origin="http://audio.ibeat.org" /><access origin="'+couchdb_host+'" />', 'utf-8'));

                // specify couchdb server and sha for cordova medic plugin via medic.json
                log('Write medic.json to autotest folder');
                var medic_config='{"sha":"'+sha+'","couchdb":"'+couchdb_host+'"}';
                fs.writeFileSync(path.join(output, '..', '..', 'www','autotest','pages', 'medic.json'),medic_config,'utf-8');
                
                defer.resolve();
            });
        }
        catch (e) {
            defer.reject(e);
        }

        return defer.promise;
    }

    return prepareMobileSpec().then(function() {
            return deploy(output, sha);
        }).then(function() {
            return waitTestsCompleted(sha, 1000 * test_timeout);
        });
};
