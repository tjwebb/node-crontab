var Crontab = require('../lib/index'),
  assert = require('assert'),
  username = require('username'),
  fs = require('fs'),
  _ = require('lodash'),
  rimraf = require('rimraf');

describe('cron-tab', function () {

  after(function () {
    var tab = Crontab.load.sync(username.sync());
    tab.remove({ comment: 'mochatest' });
    tab.save.sync();
  });

  describe('#load.sync', function () {
    it('should load current user\'s crontab without error', function () {
      Crontab.load.sync(username.sync());
    });
    it('should clear existing crontab', function () {
      var tab = Crontab.load.sync(username.sync());
      tab.remove({ comment: 'mochatest' });
      tab.save.sync();
      assert(!/^\d/.test(tab.render()));
    });
  });

  describe('#create', function () {
    it('[1 min] should schedule job using Date object', function (done) {
      this.timeout(120 * 1000);
      var tab = Crontab.load.sync(username.sync());
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
