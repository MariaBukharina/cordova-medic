var shell        = require('shelljs'),
    path         = require('path'),
    n            = require('ncallbacks'),
    fs           = require('fs'),
    mspec        = require('./mobile_spec'),
    couch        = require('../../couchdb/interface'),
    q            = require('q'),
    testRunner   = require('./testRunner');

module.exports = function(output, sha, devices, entry_point, couchdb_host, test_timeout, callback) {

    function log(msg) {
        console.log('[WP8] ' + msg + ' (sha: ' + sha + ')');
    }

    function deploy(path, sha, devices) {
        var cmd = 'cd ' + path + '\\..\\..\\ && node ..\\cordova-cli\\bin\\cordova run';
        // run option: --device, --emulator, other
        if (devices !== '') {
            cmd += ' --' + devices;
        }
        cmd += ' wp8';
        log ('starting deploy via command: ' + cmd);
        var defer = q.defer();
        shell.exec(cmd, {silent:true, async:true}, function(code, output) {
            if (code > 0) {
                defer.reject('deploy failed with code: ' + code);
            }
            else {
                defer.resolve();
            }
        });
        return defer.promise;
    }

    function prepareMobileSpec() {
        // make sure wp8 app got created first.
        var defer = q.defer();
        try {
            if (!fs.existsSync(output)) {
                throw new Error('create must have failed as output path does not exist.');
            }
            var mspec_out = path.join(output, 'www');

            log('Modifying Cordova Mobilespec application at:'+mspec_out);

            mspec(mspec_out,sha,devices,entry_point, function(err){
                if(err) {
                    throw new Error('Error thrown modifying WP8 mobile spec application.');
                }

                log('Modifying Cordova wp8 application.');
                // add the sha to the junit reporter
                var tempJasmine = path.join(output, 'www', 'jasmine-jsreporter.js');
                if (fs.existsSync(tempJasmine)) {
                    fs.writeFileSync(tempJasmine, "var library_sha = '" + sha + "';\n" + fs.readFileSync(tempJasmine, 'utf-8'), 'utf-8');
                }

                // modify start page
                var mainPageLines = fs.readFileSync(path.join(output, 'MainPage.xaml.cs')).toString().split('\n');
                var index = 0;
                while (mainPageLines[index].indexOf('InitializeComponent();') == -1) ++index;
                ++index;
                if (mainPageLines[index].indexOf(entry_point) == -1)
                    mainPageLines.splice(index, 0, '            this.CordovaView.StartPageUri = new Uri("'+ entry_point + '", UriKind.Relative);');
                fs.writeFileSync(path.join(output, 'MainPage.xaml.cs'), mainPageLines.join('\n'));

                // set permanent guid to prevent multiple installations
                var guid = '{8449DEEE-16EB-4A4A-AFCC-8446E8F06FF7}';
                var appManifestXml = path.join(output, 'Properties', 'WMAppManifest.xml');
                var xml = fs.readFileSync(appManifestXml).toString().split('\n');
                for (var i in xml) if (xml[i].indexOf('<App') != -1) {
                    if (xml[i].toLowerCase().indexOf('productid') != -1) {
                        var index = xml[i].toLowerCase().indexOf('productid');
                        var spaceIndex = xml[i].indexOf(' ', index);
                        var stringAsArray = xml[i].split('');
                        stringAsArray.splice(index, spaceIndex - index);
                        xml[i] = stringAsArray.join('');
                    }
                    xml[i] = xml[i].substr(0, xml[i].length - 1);
                    xml[i] += ' ProductID="' + guid + '">';
                    break;
                }
                fs.writeFileSync(appManifestXml, xml.join('\n'));


                // make sure the couch db server is whitelisted
                var configFile = path.join(output, 'www', 'config.xml');
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
            return deploy(output, sha, devices);
        }).then(function() {
            return testRunner.waitTestsCompleted(sha, 1000 * test_timeout);
        });
}
