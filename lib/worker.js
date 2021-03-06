var bag = require('bagofholding'),
  fs = require('fs'),
  functions = require('./functions');

/**
 * class Worker
 *
 * @param {Number} workerId: an ID unique to this worker
 */
function Worker(workerId) {
  this.workerId = workerId;
}

/**
 * Write a data file consisting of header, segment x numSegments, and footer templates.
 * File is being streamed so it can handle large content.
 * Thanks to Max Ogden's fs stream backpressure example https://gist.github.com/2516455
 *
 * @param {Object} templates: data file templates in the format of { header: '', segment: '', footer: '' }
 * @param {Number} genId: an ID unique to the current data generation, used by all worker processes
 * @param {Number} numSegments: how many segments in a data file
 * @param {String} outFile: the data file name, to be postfixed with worker ID
 * @param {Function} cb: standard cb(err, result) callback
 */
Worker.prototype.write = function (templates, genId, numSegments, outFile, cb) {

  var stream = fs.createWriteStream(outFile + this.workerId, { flags: 'w', encoding: 'utf-8' }),
    segmentId = 0,
    segmentTemplate = bag.text.compile(templates.segment),
    params = functions,
    status;

  params.gen_id = genId;
  params.worker_id = this.workerId;

  function write() {
    if (segmentId === numSegments) {
      stream.end(bag.text.apply(templates.footer, params));
    } else {
      if (segmentId === 0) {
        stream.write(bag.text.apply(templates.header, params));
      }
      params.segment_id = ++segmentId;
      status = stream.write(bag.text.applyPrecompiled(segmentTemplate, params));
      if(status) {
        write();
      }
    }
  }

  stream.on('error', function (err) {
    console.error('Error: %s', err.message);
  });
  stream.on('close', function () {
    cb();
  });
  stream.on('open', write);
  stream.on('drain', write);
};

module.exports = Worker;

/**
 * Create a worker and tell it to write a data file.
 *
 * @param {Object} message: message object from the master process
 * @param {Function} cb: callback function
 */
process.on('message', function (message) {
  console.log('Starting worker ' + message.workerId);
  new Worker(message.workerId).write(
    message.templates,
    message.genId,
    message.numSegments,
    message.outFile,
    function () {
      console.log('Finishing worker ' + message.workerId);
      process.exit(1);
    }
  );
});