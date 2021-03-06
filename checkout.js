var path = require ('path');
var glob=require('glob');
var shell = require('shelljs');
var fs = require('fs');
var argv = require('optimist').argv;

var CAT='TOOLS';
var isRelease=false;
var jsonpath ='./repos.json';
var branch_release = 'release';

function getDir(reponame) {
   return path.basename(reponame,'.git');
}

if(argv.cat) CAT=argv.cat;
if(argv.release) isRelease=true;
if(argv.path) jsonpath=argv.path;
if(argv.releasebranch) branch_release= argv.releasebranch;

var repos = JSON.parse(fs.readFileSync(jsonpath, 'utf8'));

repos.repos.forEach( function(repo) {
//    console.log('checking '+JSON.stringify(repo));
    if(repo.category == CAT) {
        var branch = repo.current;
        if(isRelease) branch = repo.release;
        if(branch =="RELEASE") branch = branch_release;
        var dir = getDir(repo.repo);
        if(fs.existsSync(dir) && fs.statSync(dir).isDirectory() ) {
            shell.pushd(dir);
            if(fs.existsSync('.git')) {
                var cmdout = shell.exec('git checkout '+branch);
            }
            shell.popd();
        }
    }
});


