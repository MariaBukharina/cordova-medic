var path = require ('path');
var shell = require('shelljs');
var buildinfo = require('./buildinfo');
var config = require('./config');
var wp8  = require('./src/build/makers/wp8');
var argv = require('optimist').argv;
var error_writer = require('./src/build/makers/error_writer');

// this assumes that you start it in the sandbox

var TEST_DIR=process.cwd().replace(/\\/g, '\\\\');
var BRANCH='master';
var TOOL_DIR=path.join(TEST_DIR,'medic');
var MSPEC_DIR=path.join(TEST_DIR,'mobilespec');

var TEST_OK=true;

if(argv.branch) BRANCH=argv.branch;

var output_location = path.join(MSPEC_DIR,'platforms','wp8');

buildinfo('WP8', BRANCH, function (error, sha ) {
    if(error) {
        TEST_OK=false;
    } else {
        // timeout to execute tests, 10 min by default
        var test_timeout = config.app.timeout ? config.app.timeout : 10 * 60;

        wp8(output_location, sha, config.wp8.target, config.app.entry, config.couchdb.host, test_timeout).then(function() {
                console.log('WP8 test execution completed');
            }, function(err) {
                TEST_OK=false;
                error_writer('wp8', sha, 'WP8 tests execution failed.', err);
            });
    }
});

process.once('exit', function () {
    if(!TEST_OK) process.exit(1);
});

