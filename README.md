# cron-tab
[![Build Status](https://secure.travis-ci.org/tjwebb/node-crontab.png)](http://travis-ci.org/tjwebb/node-crontab)

Allows reading, creating, deleting, manipulating, and saving system cronjobs with node.js.

## Installation

```bash
$ npm install cron-tab
```

## Examples

### Synchronous Loading

```js

var cron-tab = require('cron-tab');
var username = require('username');   // optional

var tab = cron-tab.load.sync(username.sync());
var job = cron-tab.create('ls -lh', new Date(1400373907766));
tab.save.sync();

```

### Asynchronous Loading
```js
require('cron-tab').load(function(err, cron-tab) {
  // create with string expression
  var job = cron-tab.create('ls -la', '0 7 * * 1,2,3,4,5');

  // create with Date
  var job = cron-tab.create('ls -lh', new Date(1400373907766));

  // create with comment
  var job = cron-tab.create('ls -lt', null, 'comment 2');

  // create special: @reboot, @hourly, @daily, @weekly, @monthly, @yearly, @annually, @midnight
  var job = cron-tab.create('ls -la', '@reboot');

  // remove object
  var job = cron-tab.create('ls -lr', '0 7 * * 1,2,3,4,5', 'comment 3');
  cron-tab.remove(job);

  // remove conditions
  cron-tab.remove({command:'ls -lh', comment:/comment 2/});

  // manipulate: every business hour
  var job = cron-tab.create('ls -l');
  job.minute().at(0);
  job.hour().between(8, 17);
  job.dow().between('mon', 'fri');

  // manipulate: every other hour on weekday nights
  var job = cron-tab.create('ls -l');
  job.hour().between(19, 0).every(2);
  job.hour().between(0, 6).every(2);
  job.dow().between('mon', 'fri');
  
  // manipulate: summer
  var job = cron-tab.create('ls -l');
  job.month().between('jun', 'sep');
  
  // manipulate: Christmas
  var job = cron-tab.create('ls -l');
  job.minute().at(30);
  job.hour().at(9);
  job.dom().on(24);
  job.month().in('dec');

  // show all jobs
  var jobs = cron-tab.jobs();

  // show jobs with conditions
  var jobs = cron-tab.jobs({command:'ls -l', comment:/comment 1/});

  // reset jobs to their original state
  cron-tab.reset();

  // save
  cron-tab.save(function(err, cron-tab) {
  
  });

  console.log(cron-tab);
});
```

### Naive reboot
```js
require('cron-tab').load(function(err, cron-tab) {
  if (err) {
    return console.error(err);
  }

  var command = 'ls -l';

  cron-tab.remove({command:command});
  cron-tab.create(command, '@reboot');

  cron-tab.save(function(err, cron-tab) {

  });
});
```

### More robust reboot and forever
```js
require('cron-tab').load(function(err, cron-tab) {
  if (err) {
    return console.error(err);
  }

  var uuid           = '64d967a0-120b-11e0-ac64-0800200c9a66';
  var nodePath       = process.execPath.split('/').slice(0, -1).join('/');
  var exportCommand  = 'export PATH=' + nodePath + ':$PATH';
  var foreverCommand = require('path').join(__dirname, 'node_modules', 'forever', 'bin', 'forever');
  var sysCommand     = exportCommand + ' && ' + foreverCommand + ' start ' + __filename;

  cron-tab.remove({comment:uuid});
  cron-tab.create(sysCommand, '@reboot', uuid);

  cron-tab.save(function(err, cron-tab) {
    console.log(err)
  });
});
```

## Credits
Forked from node-crontab

## License
Mozilla Public License 2.0
