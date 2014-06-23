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

var crontab = require('cron-tab');
var username = require('username');   // optional

var tab = crontab.load.sync(username.sync());
var job = tab.create('echo "hello world" > /tmp/demo.txt', new Date(Date.now() + 60000));
tab.save.sync();
// "hello world" will be saved to demo.txt in 1 minute

```

### Asynchronous Loading
```js
require('cron-tab').load(function(err, crontab) {
  // create with string expression
  var job = crontab.create('ls -la', '0 7 * * 1,2,3,4,5');

  // create with Date
  var job = crontab.create('ls -lh', new Date(1400373907766));

  // create with comment
  var job = crontab.create('ls -lt', null, 'comment 2');

  // create special: @reboot, @hourly, @daily, @weekly, @monthly, @yearly, @annually, @midnight
  var job = crontab.create('ls -la', '@reboot');

  // remove object
  var job = crontab.create('ls -lr', '0 7 * * 1,2,3,4,5', 'comment 3');
  crontab.remove(job);

  // remove conditions
  crontab.remove({command:'ls -lh', comment:/comment 2/});

  // manipulate: every business hour
  var job = crontab.create('ls -l');
  job.minute().at(0);
  job.hour().between(8, 17);
  job.dow().between('mon', 'fri');

  // manipulate: every other hour on weekday nights
  var job = crontab.create('ls -l');
  job.hour().between(19, 0).every(2);
  job.hour().between(0, 6).every(2);
  job.dow().between('mon', 'fri');
  
  // manipulate: summer
  var job = crontab.create('ls -l');
  job.month().between('jun', 'sep');
  
  // manipulate: Christmas
  var job = crontab.create('ls -l');
  job.minute().at(30);
  job.hour().at(9);
  job.dom().on(24);
  job.month().in('dec');

  // show all jobs
  var jobs = crontab.jobs();

  // show jobs with conditions
  var jobs = crontab.jobs({command:'ls -l', comment:/comment 1/});

  // reset jobs to their original state
  crontab.reset();

  // save
  crontab.save(function(err, crontab) {
  
  });

  console.log(crontab);
});
```

### Naive reboot
```js
require('cron-tab').load(function(err, crontab) {
  if (err) {
    return console.error(err);
  }

  var command = 'ls -l';

  crontab.remove({command:command});
  crontab.create(command, '@reboot');

  crontab.save(function(err, crontab) {

  });
});
```

### More robust reboot and forever
```js
require('cron-tab').load(function(err, crontab) {
  if (err) {
    return console.error(err);
  }

  var uuid           = '64d967a0-120b-11e0-ac64-0800200c9a66';
  var nodePath       = process.execPath.split('/').slice(0, -1).join('/');
  var exportCommand  = 'export PATH=' + nodePath + ':$PATH';
  var foreverCommand = require('path').join(__dirname, 'node_modules', 'forever', 'bin', 'forever');
  var sysCommand     = exportCommand + ' && ' + foreverCommand + ' start ' + __filename;

  crontab.remove({comment:uuid});
  crontab.create(sysCommand, '@reboot', uuid);

  crontab.save(function(err, crontab) {
    console.log(err)
  });
});
```

## Credits
Forked from node-crontab

## License
Mozilla Public License 2.0
