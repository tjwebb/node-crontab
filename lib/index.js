/**
 * Constants
 */
var COMMAND  = 'crontab';
var ITEMREX  = /^\s*([^@#\s]+)\s+([^@#\s]+)\s+([^@#\s]+)\s+([^@#\s]+)\s+([^@#\s]+)\s+([^#\n]*)(\s+#\s*([^\n]*)|$)/;
var SPECREX  = /@(\w+)\s([^#\n]*)(\s+#\s*([^\n]*)|$)/;
var SPECIALS = {
  'reboot'   : '@reboot',
  'hourly'   : '0 * * * *',
  'daily'    : '0 0 * * *',
  'weekly'   : '0 0 * * 0',
  'monthly'  : '0 0 1 * *',
  'yearly'   : '0 0 1 1 *',
  'annually' : '0 0 1 1 *',
  'midnight' : '0 0 * * *'
};

var MONTH_ENUM = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
var WEEK_ENUM  = ['sun','mon','tue','wed','thu','fri','sat','sun'];
var SINFO = [
  { 'name' : 'Minute',       'max' : 59, 'min' : 0 },
  { 'name' : 'Hours',        'max' : 23, 'min' : 0 },
  { 'name' : 'Day of Month', 'max' : 31, 'min' : 1 },
  { 'name' : 'Month',        'max' : 12, 'min' : 1, 'enumm' : MONTH_ENUM },
  { 'name' : 'Day of Week',  'max' : 7,  'min' : 0, 'enumm' : WEEK_ENUM },
];

/**
 * @ignore
 */
var Spawn = require('child_process').spawn;
var _     = require('lodash');
var exec  = require('child_process').execSync;

/**
 * @class CronTab
 * A JavaScript representation of a user crontab. Each tab has zero or more cron jobs coresponding
 * to the individual lines in the cron sytax.
 * 
 * Examples:
 *     new CronTab('bob', function(err, tab) {
 *         if (err) { console.log(err); process.exit(1); }
 *         
 *         console.log("bob's tab: " + tab.render());
 *     });
 *     
 *     new CronTab(function(err, tab) {
 *         if (err) { console.log(err); process.exit(1); }
 *         
 *         console.log("current user's tab: " + tab.render());
 *     });
 * 
 * @param {String} __username__
 * @param {Function} __callback__
 */
function CronTab(u, cb) {
  var self   = this;
  var user   = u || '';
  var root   = (process.getuid() === 0);
  var backup = {lines:[], jobs:[]};
  var lines  = [];
  var jobs   = [];
  
  load(cb);
  
  /**
   * Provides access to the jobs collection.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs((command:'ls -l /', comment:'this should run every night'));
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].render());
   *         }
   *     });
   *
   * @param {Object} __[options]__
   * @return {Array[CronJob]}
   */
  this.jobs = function(options) {
    if (!options) {
      return jobs.slice();
    }
    if (!options.command && !options.comment) {
      return jobs.slice();
    }

    var queries = _.keys(options);
    if (_.without(queries, 'comment', 'command').length > 0) {
      return [];
    }

    var results = [];
    for (var i = 0; i < jobs.length; i++) {
      var job   = jobs[i];
      var match = true;

      for (var j = 0; j < queries.length; j++) {
        var query = queries[j];

        if (!job[query]().match(options[query])) {
          match = false;
          break;
        }
      }

      if (match) {
        results.push(job);
      }
    }
    
    return results;
  };
  this.find = this.jobs;
  /**
   * Writes the crontab to the system. Saves all information.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         tab.remove(jobs);
   *         
   *         tab.save(function(err, tab) {
   *             if (err) { console.log(err); process.exit(1); }
   *
   *             console.log('saved');
   *         });
   *     });
   *
   * @param {Function} __callback__
   */
  this.save = function(cb) {
    var stdout = '';
    var stderr = '';
    var args   = makeChildArgs('save');

    if (!_.isFunction(cb)) {
      exec('echo "'+ this.render() + '" | '+ COMMAND + ' ' + args.join(' '));
      return self;
    }

    var child  = Spawn(COMMAND, args);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    
    child.stdout.on('data', function(chunk) {
      stdout += chunk;
    });
    child.stderr.on('data', function(chunk) {
      stderr += chunk;
    });
    child.on('error', function (err) {
    });
    child.on('close', function (code) {
      if (code === 0) {
        cb(null, self);
      }
      else {
        cb({message:stderr}, self);
      }
    });
    
    child.stdin.write(this.render());
    child.stdin.end();
  };

  this.save.sync = function () {
    return self.save();
  };
  /**
   * Renders the object to a string as it would be written to the system.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         console.log(tab.render());
   *     });
   *
   * @return {String}
   */
  this.render = function() {
    var tokens = [];
    
    for (var i = 0; i < lines.length; i++) {
      var job = lines[i];
      
      if (job.isValid && !job.isValid()) {
        tokens.push('# ' + job.toString());
        continue;
      }
      
      tokens.push(job.toString());
    }
    
    return tokens.join('\n').trim() + '\n';
  };
  /**
   * Creates a new job with the specified command, comment and date.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var future = Date.parse('2010/7/11');
   *         
   *         tab.create('ls -l /');
   *         tab.create('ls -l /', 'just a silly example');
   *         tab.create('ls -l /', 'just a silly example', future);
   *     });
   *
   * @param {String} __command__
   * @param {String|Date} __[when]__
   * @param {String} __[comment]__
   * @return {CronJob|null}
   */
  this.create = function(command, when, comment) {
    if (when && !_.isString(when) && !_.isDate(when)) {
      return null;
    }

    command = (command || '').trim();
    comment = (comment || '').trim();

    var job = null;
    if (_.isString(when)) {
      job = makeJob(when + ' ' + command + ' #' + comment);
    }
    else if (_.isDate(when)) {
      job = makeJob(null, command, comment);

      job.minute().on(when.getMinutes());
      job.hour().on(when.getHours());
      job.dom().on(when.getDate());
      job.month().on(when.getMonth()+1);
    }
    else {
      job = makeJob(null, command, comment);
    }

    if (job) {
      jobs.push(job);
      lines.push(job);
    }

    return job;
  };
  /**
   * Parses a raw crontab line and returns a CronJob object
   *
   * @param {String} __line__
   * @return {CronJob|null}
   */
  this.parse = function(line) {
    return makeJob(line);
  };
  /**
   * Removes the specified jobs from the crontab.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         tab.remove(jobs);
   *     });
   *
   * @param {String} __Array[CronJob]__
   */
  this.remove = function(jobs) {
    if (jobs instanceof CronJob) {
      jobs = [jobs];
    }
    else if (_.isArray(jobs)) {
      // do nothing, we do this because _.isObject([]) == true
    }
    else if (_.isObject(jobs)) {
      // jobs is actually search options
      jobs = this.jobs(jobs);
    }
    else {
      jobs = [];
    }
    
    for (var i = 0; i < jobs.length; i++) {
      remove(jobs[i]);
    }
    
    truncateLines();
  };
  /**
   * Restores this crontab to its original state.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         tab.remove(jobs);
   *         tab.reset();
   *     });
   */
  this.reset = function() {
    lines = backup.lines.slice();
    jobs  = backup.jobs.slice();
  };
  
  
  /**
   * Loads the system crontab into this object.
   *
   * @param {function} __callback__
   * 
   * @api private
   */
  function load(cb) {
    var stdout = '';
    var stderr = '';
    var args   = makeChildArgs('load');
    
    jobs  = [];
    lines = [];

    if (!_.isFunction(cb)) {
      var result = exec(COMMAND + ' ' + args.join(' '));
      onLoadComplete(result.toString());
      return self;
    }

    var child  = Spawn(COMMAND, args);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', function(chunk) {
      stdout += chunk;
    });
    child.stderr.on('data', function(chunk) {
      stderr += chunk;
    });
    child.on('error', function (err) {
    });
    child.on('close', function (code) {
      if (code !== 0 && stderr.indexOf('no crontab for ') < 0) {
        cb({ message:stderr }, self);
        return;
      }
      onLoadComplete(stdout);
      cb(null, self); 
    });
  }

  function onLoadComplete (stdout) {
    var tokens = stdout.split('\n');
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var job   = makeJob(token);
      
      if (job !== null && job.isValid()) {
        jobs.push(job);
        lines.push(job);
      }
      else {
        lines.push(token);
      }
    }
    
    truncateLines();
    
    backup.lines = lines.slice();
    backup.jobs  = jobs.slice();
  }

  /**
   * Removes the specified job from the crontab.
   *
   * @param {CronJob} __job__
   * 
   * @api private
   */
  function remove(job) {
    var oldJobs  = jobs;
    var oldLines = lines;
    
    jobs  = [];
    lines = [];
    
    for (var i = 0; i < oldJobs.length; i++) {
      var oldJob = oldJobs[i];
      
      if (oldJob != job) {
        jobs.push(oldJob);
      }
    }
    for (var j = 0; j < oldLines.length; j++) {
      var oldLine = oldLines[j];
      
      if (oldLine !== job) {
        lines.push(oldLine);
      }
    }
  }
  /**
   * Creates an array of CL arguments for the sysem "crontab" command. Intended to be passed to
   * child_process.spawn.
   *
   * @param {String} __action__ 'load' | 'save'
   * 
   * @api private
   */
  function makeChildArgs(action) {
    var actions = {load:'-l', save:'-'};
    var args    = [actions[action]];
    
    if (user) {
      args.push(userExecute().trim());
    }
    
    return args;
  }
  /**
   * Returns a user CL switch for the sysem "crontab" command.
   * 
   * @api private
   */
  function userExecute() {
    return (user) ? '-u ' + user : '';
  }
  /**
   * Creates a new job. This method exists to catch possible exceptions thrown between
   * instantiation.
   * @see CronJob
   *
   * @param {String|null} __line__
   * @param {String} __[command]__
   * @param {String} __[comment]__
   * 
   * @api private
   */
  function makeJob(line, command, comment) {
    try {
      return new CronJob(line, command, comment);
    } catch(e) {}
    
    return null;
  }
  /**
   * Compacts the line collection by removes empty lines from the end.
   * 
   * @api private
   */
  function truncateLines() {
    var line = lines.pop();
    
    while (line !== undefined && line.toString().trim() === '') {
      line = lines.pop();
    }
    
    if (line !== undefined) {
      lines.push(line);
    }
  }
}


/**
 * @class CronJob
 * A JavaScript representation of a cron job. Each job has exactly 5 time slots as per cron sytax:
 * _minute_, _hour_, _day-of-the-month_, _month_, _day-of-the-week_.
 * 
 * Examples:
 *     var job1 = new CronJob('* * * * * ls -l / #comment');
 *     var job2 = new CronJob(null, 'ls -l /', 'comment');
 *
 * @param {String|null} __line__
 * @param {String} __[command]__
 * @param {String} __[comment]__
 */
function CronJob(line, c, m) {
  var self    = this;
  var command = null;
  var comment = null;
  var valid   = false;
  var slots   = [];
  var special = false;
  
  
  /**
   * Returns true if this cron job is valid.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].isValid());
   *         }
   *     });
   *
   * @return {Boolean}
   */
  this.isValid = function() {
    return valid;
  };
  /**
   * Renders the object to a string as it would be written to the system.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].render());
   *         }
   *     });
   *
   * @return {String}
   */
  this.render = function() {
    var time = '';
    
    if (special) {
      time = special;
    }
    else {
      var tokens = [];
      
      for (var i = 0; i < 5; i++) {
        tokens.push(slots[i].toString());
      }
      
      time = tokens.join(' ');
    }
    
    var keys    = getKeys.call(SPECIALS);
    var vals    = getVals.call(SPECIALS);
    var timeIdx = vals.indexOf(time);
    
    if (timeIdx >=0 ) {
      time = '@' + keys[timeIdx];
    }
    
    var result = time + ' ' + command.toString();
    if (comment.toString() !== '') {
      result += ' #' + comment.toString();
    }
    
    return result;
  };
  /**
   * Clears all time slots. Calling this method amounts to setting the time to '* * * * *'.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].clear());
   *         }
   *     });
   */
  this.clear = function() {
    special = false;
    
    for (var i = 0; i < slots.length; i++) {
      slots[i].clear();
    }
  };
  /**
   * Returns the minute time slot.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].minute().render());
   *         }
   *     });
   *
   * @return {TimeSlot}
   */
  this.minute = function() {
    return slots[0];
  };
  /**
   * Returns the hour time slot.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].hour().render());
   *         }
   *     });
   *
   * @return {TimeSlot}
   */
  this.hour = function() {
    return slots[1];
  };
  /**
   * Returns the day-of-the-month time slot.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].dom().render());
   *         }
   *     });
   *
   * @return {TimeSlot}
   */
  this.dom = function() {
    return slots[2];
  };
  /**
   * Returns the month time slot.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].month().render());
   *         }
   *     });
   *
   * @return {TimeSlot}
   */
  this.month = function() {
    return slots[3];
  };
  /**
   * Returns the day-of-the-week time slot.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].dow().render());
   *         }
   *     });
   *
   * @return {TimeSlot}
   */
  this.dow = function() {
    return slots[4];
  };
  /**
   * Command getter/setter.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].command('new command'));
   *         }
   *     });
   *
   * @param {String} __[command]__
   * @return {String}
   */
  this.command = function(c) {
    if (c) {
      command = new CronCommand(c.toString());
    }
    
    return command.toString();
  };
  /**
   * Comment getter/setter.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].comment('new comment'));
   *         }
   *     });
   *
   * @param {String} __[comment]__
   * @return {String}
   */
  this.comment = function(c) {
    if (c) {
      comment = new CronComment(c.toString());
    }
    
    return comment.toString();
  };
  /**
   * Renders the object to a string as it would be written to the system. See __render__.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].toString());
   *         }
   *     });
   *
   * @return {String}
   */
  this.toString = function() {
    return this.render();
  };
  
  /**
   * Populates the time slots with TimeSlot objects. Call this method ONLY from __init__!
   *
   * @param {Array[String]} __[tokens]__ string tokens to parse
   * 
   * @api private
   */
  function setSlots(tokens) {
    slots = [];
    
    for (var i = 0; i < 5; i++) {
      var info  = SINFO[i];
      var value = (tokens && tokens[i] || null);
      var name  = info.name;
      var min   = info.min;
      var max   = info.max;
      var enumm = info.enumm;
      var slot  = new TimeSlot(name, min, max, enumm, value);
      
      slots.push(slot);
    }
  }
  /**
   * Initializes a new CronJob object.
   *
   * @api private
   */
  function init() {
    setSlots();
    
    if (line) {
      var result = line.match(ITEMREX);
      
      if (result && result.length > 0) {
        command = new CronCommand(result[6]);
        comment = new CronComment(result[8] || '');
        valid   = true;
        
        setSlots(result.slice(1,6));
      }
      else if (line.indexOf('@') < line.indexOf('#') || line.indexOf('#') == -1) {
        result = line.match(SPECREX);
        
        if (result && result.length > 0 && SPECIALS[result[1]]) {
            command = new CronCommand(result[2]);
            comment = new CronComment(result[4] || '');
            
            var value = SPECIALS[result[1]];
            if (value.indexOf('@') >= 0) {
              special = value;
            }
            else {
              setSlots(value.split(' '));
            }
            valid = true;
        }
      }
    }
    else if (c) {
      valid   = true;
      command = new CronCommand(c && c.toString() || '');
      comment = new CronComment(m && m.toString() || '');
    }
  }
  
  init();
}


/**
 * @class TimeSlot
 * A JavaScript representation of a time slot (e.g. minute, hour, month). Each slot has zero or
 * more time ranges coresponding to the comma separated list in the cron sytax 
 * (e.g. _* / 4_, _10_, 5-15/2).
 * 
 * Examples:
 *     var enumm = ['jan','feb','mar','apr',
 *                 'may','jun','jul','aug',
 *                 'sep','oct','nov','dec'];
 *
 *     var slot1 = new TimeSlot('Month', 1, 12, enumm);
 *     var slot2 = new TimeSlot('Minute', 0, 59, null, '');
 *
 * @param {String} __name__ (e.g 'Minute', 'Month')
 * @param {Number} __min__ minimum value
 * @param {Number} __max__ maximum value
 * @param {Object|null} __enumm__ an object enumerating all possible values
 * @param {String|null} __value__ a value to parse (e.g '19-0/2,0-3')
 */
function TimeSlot(_name, _min, _max, _enumm, value) {
  var self  = this;
  var name  = _name;
  var min   = _min;
  var max   = _max;
  var enumm = _enumm;
  var parts = [];
  
  
  /**
   * Returns the minimum value for this time slot.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].month().getMin());
   *         }
   *     });
   *
   * @return {Number}
   */
  this.getMin = function() {
    return min;
  };
  /**
   * Returns the maximum value for this time slot.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].month().getMax());
   *         }
   *     });
   *
   * @return {Number}
   */
  this.getMax = function() {
    return max;
  };
  /**
   * Returns the allowed value enumeration for this time slot.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].month().getEnum());
   *         }
   *     });
   *
   * @return {Object}
   */
  this.getEnum = function() {
    return enumm;
  };
  /**
   * Renders the object to a string as it would be written to the system.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].month().render());
   *         }
   *     });
   *
   * @return {Object}
   */
  this.render = function() {
    return parts.map(function(part) {
      return part.toString();
    }).join(',') || '*';
  };
  /**
   * Set this time slot to repeat every n units e.g. _* / n_
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             // every other month
   *             jobs[i].month().every(2);
   *         }
   *     });
   *
   * @param {Number} __number__
   * @return {TimeRange}
   */
  this.every = function(n) {
    try {
      var range = new TimeRange(self, '*/' + parseInt(n));
      parts.push(range);
      
      return range;
    }
    catch (e) {}
    
    return null;
  };
  /**
   * Set this time slot to repeat exactly at the specified values e.g. _0,12_
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             // at midnight and noon
   *             jobs[i].hour().on(0, 12);
   *             jobs[i].minute().on(0);
   *         }
   *     });
   *
   * @param {Number} __value+__ one or more values
   * @return {TimeRange}
   */
  this.on = function() {
    for (var i = 0; i < arguments.length; i++) {
      parts.push(arguments[i]);
    }
  };
  /**
   * Set this time slot to repeat exactly at the specified values e.g. _0,12_
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             // at midnight and noon
   *             jobs[i].hour().on(0, 12);
   *             jobs[i].minute().on(0);
   *         }
   *     });
   *
   * @param {Number} __value+__ one or more values
   * @return {TimeRange}
   */
  this.at = this.on;
  this.in = this.on;
  /**
   * Set this time slot to repeat between from and to e.g. _from - to_
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             // business hours
   *             jobs[i].hour().between(9, 17);
   *         }
   *     });
   *
   * @param {Number} __from__
   * @param {Number} __to__
   * @return {TimeRange}
   */
  this.between = function(from, to) {
    try {
      var range = new TimeRange(self, from + '-' + to);
      parts.push(range);
      
      return range;
    }
    catch (e) {}
    
    return null;
  };
  /**
   * Clears this time slot. Calling this method amounts to setting the slot to '*'.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].month().clear());
   *         }
   *     });
   */
  this.clear = function() {
    parts = [];
  };
  /**
   * Renders the object to a string as it would be written to the system. See __render__.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].month().toString());
   *         }
   *     });
   *
   * @return {String}
   */
  this.toString = function() {
    return this.render();
  };
  
  /**
   * Initializes a new TimeSlot object.
   *
   * @api private
   */
  function init() {
    if (value) {
      var tokens = value.split(',');
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        
        if (token.indexOf('/') > 0 || token.indexOf('-') > 0 || token == '*') {
          var range = new TimeRange(self, token);
          parts.push(range);
        }
        else {
          var lPart    = token.toLowerCase();
          var enummIdx = (enumm || []).indexOf(lPart);
          
          if (enummIdx >= 0) {
            token = enummIdx;
          }
              
          var iPart = parseInt(token);
          if (iPart !== iPart) {
            throw {message:'Unknown cron time part for ' + name + ': ' + token};
          }
          
          parts.push(iPart);
        }
      }
    }
  }
  
  init();
}


/**
 * @class TimeRange
 * A JavaScript representation of a time range. Each range has a _from_, _to_, and _step_ values.
 * 
 * Examples:
 *     var enumm = ['jan','feb','mar','apr',
 *                 'may','jun','jul','aug',
 *                 'sep','oct','nov','dec'];
 *
 *     var slot   = new TimeSlot('Month', 1, 12, enumm);
 *     var range1 = new TimeRange(slot, '* / 2'); // every other month
 *     var range2 = new TimeRange(slot, 'jun - sep'); // every summer
 *
 * @param {TimeSlot} __slot__ The owner time slot object
 * @param {String} __range__ The range string e.g. _* / 2_, _jun - sep_
 */
function TimeRange(s, range) {
  var self  = this;
  var slot  = s;
  var from  = null;
  var to    = null;
  var step  = 1;
  
  
  /**
   * Renders the object to a string as it would be written to the system.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].hour().between(9, 17).render());
   *         }
   *     });
   *
   * @return {String}
   */
  this.render = function() {
    var value = '*';
    
    if (from > slot.getMin() || to < slot.getMax()) {
      value = from + '-' + to;
    }
    if (step != 1) {
      value += '/' + step;
    }
    
    return value;
  };
  /**
   * Set the step value for this range.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             // every other business hour
   *             jobs[i].hour().between(9, 17).every(2);
   *         }
   *     });
   */
  this.every = function(value) {
    step = parseInt(value);
  };
  /**
   * Renders the object to a string as it would be written to the system. See __render__.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].hour().between(9, 17).toString());
   *         }
   *     });
   *
   * @return {String}
   */
  this.toString = function() {
    return this.render();
  };
  
  /**
   * Converts a string value representing a range limit to an integer.
   *
   * @param {String} __value__ e.g. _5_,_mon_,_jan_
   * @return {Number}
   *
   * @api private
   */
  function cleanValue(value) {
    var sValue   = String(value);
    var lValue   = sValue.toLowerCase();
    var enummIdx = (slot.getEnum() || []).indexOf(lValue);
    
    if (enummIdx >= 0) {
      value = enummIdx;
    }
    
    var iValue = parseInt(value);
    if (iValue >= slot.getMin() && iValue <= slot.getMax()) {
      return iValue;
    }
    
    return null;
  }
  
  /**
   * Initializes a new TimeRange object.
   *
   * @api private
   */
  function init() {
    var tokens;
    if (!range) {
      range = '*';
    }
    
    if (range.indexOf('/') > 0) {
      tokens = range.split('/');
      
      range = tokens[0];
      step  = tokens[1];
    }
    
    if (range.indexOf('-') > 0) {
      tokens = range.split('-');
      
      from = cleanValue(tokens[0]);
      to   = cleanValue(tokens[1]);
      
      if (from === null) {
        throw {message:'Invalid range value ' + tokens[0]};
      }
      else if (to === null) {
        throw {message:'Invalid range value ' + tokens[1]};
      }
    }
    else if (range == '*') {
      from = slot.getMin();
      to   = slot.getMax();
    }
    else {
      throw {message:'Unknown time range value ' + range};
    }
  }
  
  init();
}


/**
 * @class CronCommand
 * A JavaScript representation of the command part of a cron job.
 * 
 * Examples:
 *     var command = new CronCommand('ls -l /');
 *
 * @param {String} __line__
 */
function CronCommand(line) {
  var command = line;
  
  
  /**
   * Returns true if the pattern that was passed matches this command.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             // true
   *             console.log(jobs[i].command().match('ls -l /'));
   *         }
   *     });
   *
   * @param {String|RegEx} __pattern__
   * @return {Boolean}
   */
  this.match = function(pattern) {
    if (_.isString(pattern) && !!~command.indexOf(pattern)) {
      return true;
    }
    if (_.isRegExp(pattern)) {
      return pattern.test(command);
    }
    
    return false;
  };
  /**
   * Renders the object to a string as it would be written to the system.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({command:'ls -l /'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].command().toString());
   *         }
   *     });
   *
   * @return {String}
   */
  this.toString = function() {
    return command;
  };
}


/**
 * @class CronComment
 * A JavaScript representation of the inline comment part of a cron job.
 * 
 * Examples:
 *     var comment = new CronComment('run this on the weekend');
 *
 * @param {String} __line__
 */
function CronComment(line) {
  var comment = line;
  
  
  /**
   * Returns true if the pattern that was passed matches this comment.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({comment:'run this on the weekend'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             // true
   *             console.log(jobs[i].comment().match('run this on the weekend'));
   *         }
   *     });
   *
   * @param {String|RegEx} __pattern__
   * @return {Boolean}
   */
  this.match = function(pattern) {
    if (_.isString(pattern) && !!~command.indexOf(pattern)) {
      return true;
    }
    if (_.isRegExp(pattern)) {
      return pattern.test(comment);
    }
    
    return false;
  };
  /**
   * Renders the object to a string as it would be written to the system.
   * 
   * Examples:
   *     new CronTab(function(err, tab) {
   *         if (err) { console.log(err); process.exit(1); }
   *         
   *         var jobs = tab.jobs({comment:'run this on the weekend'});
   *         for (var i = 0; i < jobs.length; i++) {
   *             console.log(jobs[i].comment().toString());
   *         }
   *     });
   *
   * @return {String}
   */
  this.toString = function() {
    return comment;
  };
}


/* @api private */
function getKeys() {
  return Object.keys(this);
}

function getVals() {
  var keys = getKeys.call(this);
  var vals = [];
  
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    vals.push(this[key]);
  }
  
  return vals;
}

// public API
exports.load = function(username, callback) {
  if (_.isString(username) && _.isFunction(callback)) {
    return new CronTab(username, callback);
  }
  else {
    if (_.isString(username)) {
      exec('id -u '+ username);
      return new CronTab(username.trim(), callback);
    }
    else {
      callback = username;
      return new CronTab('', callback);
    }
  }
};
exports.load.sync = function (username) {
  return exports.load(username);
};
