var crontab = require('../lib/index'),
  username = require('username'),
  fs = require('fs'),
  _ = require('lodash'),
  rimraf = require('rimraf');

describe('cron-tab', function () {

  after(function () {
    var tab = crontab.load.sync(username.sync());
    tab.remove({ comment: 'mochatest' });
    tab.save.sync();
  });

  describe('#load.sync', function () {
    it('should load current user\'s crontab without error', function () {
      crontab.load.sync(username.sync());
    });
    it('should clear existing crontab', function () {
      var tab = crontab.load.sync(username.sync());
      tab.remove({ comment: 'mochatest' });
      tab.save.sync();
      assert(!/^\d/.test(tab.render()));
    });
  });

  describe('#create', function () {
    it('[1 min] should run README example', function (done) {
      this.timeout(120 * 1000);

      var tab = crontab.load.sync(username.sync());
      var job = tab.create('echo "hello world" > /tmp/demo.txt', new Date(Date.now() + 60000));
      tab.save.sync();

      var i = setInterval(function () {
        var exists = fs.existsSync('/tmp/demo.txt');
        if (!exists) return;

        var results = fs.readFileSync('/tmp/demo.txt');
        if (/hello world/.test(results.toString())) {
          clearInterval(i);
          fs.unlinkSync('/tmp/demo.txt');
          done();
        }
      }, 100);
    });
    it('[1 min] should schedule job using Date object', function (done) {
      this.timeout(120 * 1000);

      var tab = crontab.load.sync(username.sync());
      var now = new Date().valueOf();
      var filename = '/tmp/cronmocha-'+ now;
      var echo = 'echo "'+ (now + 60000) +'" | sudo tee -a '+ filename;
      var job = tab.create(echo, new Date(now + 60000), 'test');

      tab.save.sync();

      var i = setInterval(function () {
        var exists = fs.existsSync(filename);
        if (!exists) return;

        var results = fs.readFileSync(filename);
        if (new RegExp((now + 60000).toString()).test(results.toString())) {
          clearInterval(i);
          fs.unlinkSync(filename);
          done();
        }
      }, 100);
    });
  });
});
