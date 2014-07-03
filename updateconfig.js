// /usr/bin/env node
 
var fs   = require('fs'),
    path = require('path'),
    config = require('./config'),
    argv = require('optimist').argv;

//get parameters, that should been written to config.xml
var entry_point = config.app.entry,
    couch_host = config.couchdb.host;

var configFile = path.join('mobilespec', 'config.xml');
if (!fs.existsSync(configFile)){
    console.log('Config.xml file doesn\'t exists');
    process.exit(2);
} else {
    try {
        var configContent = fs.readFileSync(configFile, 'utf-8');
        // replace/add start page preference
        // check if config.xml already contains <content /> element
        if (configContent.match(/<content\s*src=".*"\s*\/>/gi)){
            configContent.replace(/<content\s*src=".*"\s*\/>/gi, entry_point);
        } else {
            // add entry point to config
            console.log('Setting entry point to ' + entry_point + ' in config.xml');
            configContent = configContent.split('</widget>').join('') +
                '    <content src="' + entry_point + '"/>\n</widget>';
        }

        // Whitelists support on windows 8 is broken and cause build errors
        if (argv.windows || argv.windows8){
            console.warn('Current platform is windows. Removing all whitelist rules.');
            configContent.replace(/<access\s+origin=.*?\/>/gi, '');
        } else {
            // add whitelisting rule allow access to couch server
            console.log('Adding whitelist rule for CouchDB host: ' + couch_host);
            configContent = configContent.split('</widget>').join('') +
                '    <access origin="' + couch_host + '" />\n</widget>';
        }

        fs.writeFileSync(configFile, configContent, 'utf-8');
    } catch (e) {
        console.log(e);
        process.exit(2);
    }
}