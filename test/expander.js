var Emitter = require("events").EventEmitter;
var mocks = require("mock-firmata"),
  MockFirmata = mocks.Firmata;
var controller = require("./util/mock-expander-controller");
var five = require("../lib/johnny-five.js");
var sinon = require("sinon");
var Board = five.Board;
var Expander = five.Expander;
var Led = five.Led;
var Button = five.Button;


function newBoard() {
  var io = new MockFirmata();
  var board = new Board({
    io: io,
    debug: false,
    repl: false
  });

  io.emit("connect");
  io.emit("ready");

  return board;
}

function restore(target) {
  for (var prop in target) {

    if (Array.isArray(target[prop])) {
      continue;
    }

    if (target[prop] != null && typeof target[prop].restore === "function") {
      target[prop].restore();
    }

    if (typeof target[prop] === "object") {
      restore(target[prop]);
    }
  }
}

exports["Expander"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();
    this.board = newBoard();
    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  noparams: function(test) {
    test.expect(1);

    test.throws(function() {
      new Expander();
    });

    test.done();
  },

  invalidControllerString: function(test) {
    test.expect(1);

    test.throws(function() {
      new Expander("INVALID_CONTROLLER_STRING");
    });

    test.done();
  },

  validControllerString: function(test) {
    test.expect(6);

    [
      "MCP23017",
      "MCP23008",
      "PCF8574",
      "PCF8574A",
      "PCF8575",
      "PCA9685",
    ].forEach(function(controller) {
      test.doesNotThrow(function() {
        new Expander(controller);
      });
    });


    test.done();
  },

  hasController: function(test) {
    test.expect(6);

    [
      "MCP23017",
      "MCP23008",
      "PCF8574",
      "PCF8574A",
      "PCF8575",
      "PCA9685",
    ].forEach(function(controller) {
      test.equal(Expander.hasController(controller), true);
    });

    test.done();
  },

  skipsPinNormalizationCall: function(test) {
    test.expect(6);

    this.normalize = sinon.spy(Board.Pins, "normalize");

    [
      "MCP23017",
      "MCP23008",
      "PCF8574",
      "PCF8574A",
      "PCF8575",
      "PCA9685",
    ].forEach(function(controller) {
      new Expander(controller);

      test.equal(this.normalize.called, false);
    }, this);

    test.done();
  },

  noController: function(test) {
    test.expect(1);

    test.throws(function() {
      new Expander({
        board: this.board
      });
    }.bind(this));

    test.done();
  },

  userController: function(test) {
    test.expect(1);

    test.doesNotThrow(function() {
      new Expander({
        board: this.board,
        controller: {}
      });
    }.bind(this));

    test.done();
  },

  emitter: function(test) {
    test.expect(1);

    var expander = new Expander({
      board: this.board,
      controller: "PCA9685"
    });

    test.ok(expander instanceof Emitter);

    test.done();
  },

  initializes: function(test) {
    test.expect(1);

    this.initialize = sinon.spy(controller.initialize, "value");

    new Expander({
      board: this.board,
      controller: controller
    });

    test.equal(this.initialize.callCount, 1);

    test.done();
  },

  virtualBoardBase: function(test) {
    test.expect(5);

    var expander = new Expander({
      board: this.board,
      controller: controller
    });

    test.equal(expander.HIGH, 1);
    test.equal(expander.LOW, 0);
    test.deepEqual(expander.MODES, {});
    test.deepEqual(expander.pins, []);
    test.deepEqual(expander.analogPins, []);

    test.done();
  },

  virtualBoard: function(test) {
    test.expect(13);

    this.initialize = sinon.stub(controller.initialize, "value", function() {
      this.MODES.INPUT = this.io.MODES.INPUT;
      this.MODES.OUTPUT = this.io.MODES.OUTPUT;

      for (var i = 0; i < 8; i++) {
        this.pins.push({
          supportedModes: [
            this.io.MODES.INPUT,
            this.io.MODES.OUTPUT
          ],
          mode: 0,
          value: 0,
          report: 0,
          analogChannel: 127
        });

        this.pinMode(i, this.MODES.OUTPUT);
        this.digitalWrite(i, this.LOW);
      }

      this.name = "Expander:SOME_CHIP";
      this.isReady = true;
    });

    this.pinMode = sinon.spy(controller.pinMode, "value");
    this.digitalWrite = sinon.spy(controller.digitalWrite, "value");
    this.digitalRead = sinon.spy(controller.digitalRead, "value");

    var expander = new Expander({
      board: this.board,
      controller: controller
    });

    var board = new Board.Virtual({
      io: expander
    });

    test.equal(this.initialize.callCount, 1);
    test.equal(this.pinMode.callCount, 8);
    test.equal(this.digitalWrite.callCount, 8);
    test.equal(expander.MODES.INPUT, this.board.io.MODES.INPUT);
    test.equal(expander.MODES.OUTPUT, this.board.io.MODES.OUTPUT);

    var led = new Led({
      pin: 0,
      board: board
    });

    led.on();
    led.off();

    test.equal(this.pinMode.callCount, 9);
    test.equal(this.digitalWrite.callCount, 10);
    test.deepEqual(this.pinMode.lastCall.args, [0, 1]);
    test.deepEqual(this.digitalWrite.getCall(8).args, [0, 1]);
    test.deepEqual(this.digitalWrite.getCall(9).args, [0, 0]);

    var button = new Button({
      pin: 1,
      board: board
    });

    var callback = this.digitalRead.args[0][1];

    test.equal(this.pinMode.callCount, 10);
    test.equal(this.digitalRead.callCount, 1);

    // Fake timers and debounce don't play well.
    button.on("down", function() {
      test.ok(true);
      test.done();
    });

    callback(button.downValue);
  },

  throwsOnReuseOfAddress: function(test) {
    test.expect(1);

    new Expander({
      address: 0x20,
      controller: "PCF8574",
      board: this.board
    });

    test.throws(function() {
      new Expander({
        address: 0x20,
        controller: "PCA9685",
        board: this.board
      });
    }.bind(this));

    test.done();
  },
};

exports["Expander.get(opts)"] = {
  setUp: function(done) {

    this.board = newBoard();

    this.expander = new Expander({
      controller: "PCF8574",
      board: this.board
    });
    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  getsAnExistingExpander: function(test) {
    test.expect(1);
    test.equal(Expander.get({ address: 0x20, controller: "PCF8574" }), this.expander);
    test.done();
  },

  getsANewExpander: function(test) {
    test.expect(1);
    test.notEqual(Expander.get({ address: 0x21, controller: "PCF8574" }), this.expander);
    test.done();
  },

  throwsOnReuseOfAddress: function(test) {
    test.expect(1);

    test.throws(function() {
      Expander.get({ address: 0x20, controller: "PCA9685" });
    });

    test.done();
  },

  coercesAddress: function(test) {
    test.expect(1);

    test.throws(function() {
      Expander.get({ address: "0x20", controller: "PCA9685" });
    });

    test.done();
  },

  throwsOnInvalidAddress: function(test) {
    test.expect(1);

    test.throws(function() {
      Expander.get({ address: "invalid", controller: "PCA9685" });
    });

    test.done();
  },

  throwsOnInvalidController: function(test) {
    test.expect(1);

    test.throws(function() {
      Expander.get({ address: 0x20, controller: {} });
    });

    test.done();
  },
};

exports["Expander.byAddress(...)"] = {
  setUp: function(done) {

    this.board = newBoard();

    this.expander = new Expander({
      controller: "PCF8574",
      board: this.board
    });
    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  byAddress: function(test) {
    test.expect(2);

    test.equal(Expander.byAddress(0x20), this.expander);
    test.equal(Expander.byAddress(0x38), undefined);
    test.done();
  },
};

exports["Expander.byController(...)"] = {
  setUp: function(done) {

    this.board = newBoard();

    this.expander = new Expander({
      controller: "PCF8574",
      board: this.board
    });
    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  byController: function(test) {
    test.expect(2);

    test.equal(Expander.byController("PCF8574"), this.expander);
    test.equal(Expander.byController("ANOTHER"), undefined);
    test.done();
  },
};


exports["Expander - MCP23017"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "MCP23017",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  fwdOptionsToi2cConfig: function(test) {
    test.expect(3);

    this.i2cConfig.reset();

    new Expander({
      controller: "MCP23017",
      address: 0xff,
      bus: "i2c-1",
      board: this.board
    });

    var forwarded = this.i2cConfig.lastCall.args[0];

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(forwarded.address, 0xff);
    test.equal(forwarded.bus, "i2c-1");

    test.done();
  },

  initialization: function(test) {
    test.expect(34);

    test.equal(this.i2cConfig.callCount, 1);
    // 2 initialization calls + (16 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 34);

    // console.log(this.i2cWrite.getCall(0).args);
    // 2 For initialization
    test.deepEqual(this.i2cWrite.getCall(0).args, [ 32, [ 0, 255 ] ]);
    test.deepEqual(this.i2cWrite.getCall(1).args, [ 32, [ 1, 255 ] ]);

    var byte = 0x100;
    var dir = 0;
    var gpio = 18;
    var multiple = 2;

    for (var i = 2; i < 32; i += 2) {
      if (i === 18) {
        dir = 1;
        gpio = 19;
        multiple = 2;
      }

      test.deepEqual(this.i2cWrite.getCall(i).args, [ 32, [ dir, byte - multiple ] ]);
      test.deepEqual(this.i2cWrite.getCall(i + 1).args, [ 32, [ gpio, byte - multiple ] ]);

      multiple <<= 1;
    }

    test.done();
  },

  normalize: function(test) {
    test.expect(16);

    for (var i = 0; i < 16; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 0);
    }

    var expects = [
      [ 32, [ 0, 1 ] ],
      [ 32, [ 0, 3 ] ],
      [ 32, [ 0, 7 ] ],
      [ 32, [ 0, 15 ] ],
      [ 32, [ 0, 31 ] ],
      [ 32, [ 0, 63 ] ],
      [ 32, [ 0, 127 ] ],
      [ 32, [ 0, 255 ] ],
      [ 32, [ 1, 1 ] ],
      [ 32, [ 1, 3 ] ],
      [ 32, [ 1, 7 ] ],
      [ 32, [ 1, 15 ] ],
      [ 32, [ 1, 31 ] ],
      [ 32, [ 1, 63 ] ],
      [ 32, [ 1, 127 ] ],
      [ 32, [ 1, 255 ] ]
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 32, [ 18, 1 ] ],
      [ 32, [ 18, 3 ] ],
      [ 32, [ 18, 7 ] ],
      [ 32, [ 18, 15 ] ],
      [ 32, [ 18, 31 ] ],
      [ 32, [ 18, 63 ] ],
      [ 32, [ 18, 127 ] ],
      [ 32, [ 18, 255 ] ],
      [ 32, [ 19, 1 ] ],
      [ 32, [ 19, 3 ] ],
      [ 32, [ 19, 7 ] ],
      [ 32, [ 19, 15 ] ],
      [ 32, [ 19, 31 ] ],
      [ 32, [ 19, 63 ] ],
      [ 32, [ 19, 127 ] ],
      [ 32, [ 19, 255 ] ]
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  pullUp: function(test) {
    test.expect(1);

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.pullUp(j, 1);
    }

    var expects = [
      [ 32, [ 12, 1 ] ],
      [ 32, [ 12, 3 ] ],
      [ 32, [ 12, 7 ] ],
      [ 32, [ 12, 15 ] ],
      [ 32, [ 12, 31 ] ],
      [ 32, [ 12, 63 ] ],
      [ 32, [ 12, 127 ] ],
      [ 32, [ 12, 255 ] ],
      [ 32, [ 13, 1 ] ],
      [ 32, [ 13, 3 ] ],
      [ 32, [ 13, 7 ] ],
      [ 32, [ 13, 15 ] ],
      [ 32, [ 13, 31 ] ],
      [ 32, [ 13, 63 ] ],
      [ 32, [ 13, 127 ] ],
      [ 32, [ 13, 255 ] ]
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ]
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:MCP23017 does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:MCP23017 does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:MCP23017 does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:MCP23017 does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:MCP23017 does not support i2cRead"
    );

    test.done();
  },

};

exports["Expander - MCP23008"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "MCP23008",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  fwdOptionsToi2cConfig: function(test) {
    test.expect(3);

    this.i2cConfig.reset();

    new Expander({
      controller: "MCP23008",
      address: 0xff,
      bus: "i2c-1",
      board: this.board
    });

    var forwarded = this.i2cConfig.lastCall.args[0];

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(forwarded.address, 0xff);
    test.equal(forwarded.bus, "i2c-1");

    test.done();
  },

  initialization: function(test) {
    test.expect(19);

    test.equal(this.i2cConfig.callCount, 1);
    // 2 initialization calls + (16 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 17);

    // console.log(this.i2cWrite.getCall(0).args);
    // 2 For initialization
    test.deepEqual(this.i2cWrite.getCall(0).args, [ 32, [ 0, 255 ] ]);

    var byte = 0x100;
    var dir = 0;
    var gpio = 9;
    var multiple = 2;

    for (var i = 1; i < 16; i += 2) {
      test.deepEqual(this.i2cWrite.getCall(i).args, [ 32, [ dir, byte - multiple ] ]);
      test.deepEqual(this.i2cWrite.getCall(i + 1).args, [ 32, [ gpio, byte - multiple ] ]);

      multiple <<= 1;
    }

    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 0);
    }

    var expects = [
      [ 32, [ 0, 1 ] ],
      [ 32, [ 0, 3 ] ],
      [ 32, [ 0, 7 ] ],
      [ 32, [ 0, 15 ] ],
      [ 32, [ 0, 31 ] ],
      [ 32, [ 0, 63 ] ],
      [ 32, [ 0, 127 ] ],
      [ 32, [ 0, 255 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 32, [ 9, 1 ] ],
      [ 32, [ 9, 3 ] ],
      [ 32, [ 9, 7 ] ],
      [ 32, [ 9, 15 ] ],
      [ 32, [ 9, 31 ] ],
      [ 32, [ 9, 63 ] ],
      [ 32, [ 9, 127 ] ],
      [ 32, [ 9, 255 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  pullUp: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.pullUp(j, 1);
    }

    var expects = [
      [ 32, [ 6, 1 ] ],
      [ 32, [ 6, 3 ] ],
      [ 32, [ 6, 7 ] ],
      [ 32, [ 6, 15 ] ],
      [ 32, [ 6, 31 ] ],
      [ 32, [ 6, 63 ] ],
      [ 32, [ 6, 127 ] ],
      [ 32, [ 6, 255 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ]
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:MCP23008 does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:MCP23008 does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:MCP23008 does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:MCP23008 does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:MCP23008 does not support i2cRead"
    );

    test.done();
  },
};

exports["Expander - PCF8574"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "PCF8574",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  fwdOptionsToi2cConfig: function(test) {
    test.expect(3);

    this.i2cConfig.reset();

    new Expander({
      controller: "PCF8574",
      address: 0xff,
      bus: "i2c-1",
      board: this.board
    });

    var forwarded = this.i2cConfig.lastCall.args[0];

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(forwarded.address, 0xff);
    test.equal(forwarded.bus, "i2c-1");

    test.done();
  },

  initialization: function(test) {
    test.expect(4);

    test.equal(this.i2cConfig.callCount, 1);
    // 1 initialization call + (8 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 16);

    test.deepEqual(this.i2cWrite.getCall(0).args, [ 32, 0 ]);

    test.deepEqual(this.i2cWrite.args, [
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ]
    ]);

    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinModeInput: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 0);
    }

    var expects = [
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  pinModeOutput: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    var expects = [
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
    ];


    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 32, 1 ],
      [ 32, 3 ],
      [ 32, 7 ],
      [ 32, 15 ],
      [ 32, 31 ],
      [ 32, 63 ],
      [ 32, 127 ],
      [ 32, 255 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ]
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:PCF8574 does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:PCF8574 does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:PCF8574 does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:PCF8574 does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:PCF8574 does not support i2cRead"
    );

    test.done();
  },
};

exports["Expander - PCF8574A"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "PCF8574A",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  fwdOptionsToi2cConfig: function(test) {
    test.expect(3);

    this.i2cConfig.reset();

    new Expander({
      controller: "PCF8574A",
      address: 0xff,
      bus: "i2c-1",
      board: this.board
    });

    var forwarded = this.i2cConfig.lastCall.args[0];

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(forwarded.address, 0xff);
    test.equal(forwarded.bus, "i2c-1");

    test.done();
  },

  initialization: function(test) {
    test.expect(4);

    test.equal(this.i2cConfig.callCount, 1);
    // 1 initialization call + (8 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 16);

    test.deepEqual(this.i2cWrite.getCall(0).args, [ 56, 0 ]);

    test.deepEqual(this.i2cWrite.args, [
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ]
    ]);


    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinModeInput: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 0);
    }

    var expects = [
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  pinModeOutput: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    var expects = [
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 56, 1 ],
      [ 56, 3 ],
      [ 56, 7 ],
      [ 56, 15 ],
      [ 56, 31 ],
      [ 56, 63 ],
      [ 56, 127 ],
      [ 56, 255 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ]
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:PCF8574A does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:PCF8574A does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:PCF8574A does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:PCF8574A does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:PCF8574A does not support i2cRead"
    );

    test.done();
  },
};


exports["Expander - PCF8575"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "PCF8575",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  fwdOptionsToi2cConfig: function(test) {
    test.expect(3);

    this.i2cConfig.reset();

    new Expander({
      controller: "PCF8575",
      address: 0xff,
      bus: "i2c-1",
      board: this.board
    });

    var forwarded = this.i2cConfig.lastCall.args[0];

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(forwarded.address, 0xff);
    test.equal(forwarded.bus, "i2c-1");

    test.done();
  },


  initialization: function(test) {
    test.expect(4);

    test.equal(this.i2cConfig.callCount, 1);
    // 1 initialization call + (8 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 17);

    test.deepEqual(this.i2cWrite.getCall(0).args, [ 32, [ 0, 0 ] ]);

    test.deepEqual(this.i2cWrite.args, [
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
      [ 32, [ 0, 0 ] ],
    ]);
    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(1);

    this.i2cWrite.reset();
    test.equal(this.i2cWrite.callCount, 0);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 32, [ 255, 0 ] ],
      [ 32, [ 255, 0 ] ],
      [ 32, [ 255, 0 ] ],
      [ 32, [ 255, 0 ] ],
      [ 32, [ 255, 0 ] ],
      [ 32, [ 255, 0 ] ],
      [ 32, [ 255, 0 ] ],
      [ 32, [ 255, 0 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 32, 2 ],
      [ 32, 2 ],
      [ 32, 2 ],
      [ 32, 2 ],
      [ 32, 2 ],
      [ 32, 2 ],
      [ 32, 2 ],
      [ 32, 2 ],
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:PCF8575 does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:PCF8575 does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:PCF8575 does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:PCF8575 does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:PCF8575 does not support i2cRead"
    );

    test.done();
  },
};

exports["Expander - PCA9685"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWriteReg = sinon.spy(MockFirmata.prototype, "i2cWriteReg");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "PCA9685",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  fwdOptionsToi2cConfig: function(test) {
    test.expect(3);

    this.i2cConfig.reset();

    new Expander({
      controller: "PCA9685",
      address: 0xff,
      bus: "i2c-1",
      board: this.board
    });

    var forwarded = this.i2cConfig.lastCall.args[0];

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(forwarded.address, 0xff);
    test.equal(forwarded.bus, "i2c-1");

    test.done();
  },

  initialization: function(test) {
    test.expect(4);

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(this.i2cWrite.callCount, 16);

    //(8 * (pinMode + digitalWrite))
    test.equal(this.i2cWriteReg.callCount, 5);

    test.deepEqual(this.i2cWrite.args, [
      [ 64, [ 6, 0, 0, 4096, 16 ] ],
      [ 64, [ 10, 0, 0, 4096, 16 ] ],
      [ 64, [ 14, 0, 0, 4096, 16 ] ],
      [ 64, [ 18, 0, 0, 4096, 16 ] ],
      [ 64, [ 22, 0, 0, 4096, 16 ] ],
      [ 64, [ 26, 0, 0, 4096, 16 ] ],
      [ 64, [ 30, 0, 0, 4096, 16 ] ],
      [ 64, [ 34, 0, 0, 4096, 16 ] ],
      [ 64, [ 38, 0, 0, 4096, 16 ] ],
      [ 64, [ 42, 0, 0, 4096, 16 ] ],
      [ 64, [ 46, 0, 0, 4096, 16 ] ],
      [ 64, [ 50, 0, 0, 4096, 16 ] ],
      [ 64, [ 54, 0, 0, 4096, 16 ] ],
      [ 64, [ 58, 0, 0, 4096, 16 ] ],
      [ 64, [ 62, 0, 0, 4096, 16 ] ],
      [ 64, [ 66, 0, 0, 4096, 16 ] ]
    ]);

    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(2);

    this.i2cWrite.reset();
    this.i2cWriteReg.reset();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 0);
    }

    // No calls are made, pinMode is purely for compatibility
    test.deepEqual(this.i2cWrite.callCount, 0);
    test.deepEqual(this.i2cWriteReg.callCount, 0);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 64, [ 6, 4096, 16, 0, 0 ] ],
      [ 64, [ 10, 4096, 16, 0, 0 ] ],
      [ 64, [ 14, 4096, 16, 0, 0 ] ],
      [ 64, [ 18, 4096, 16, 0, 0 ] ],
      [ 64, [ 22, 4096, 16, 0, 0 ] ],
      [ 64, [ 26, 4096, 16, 0, 0 ] ],
      [ 64, [ 30, 4096, 16, 0, 0 ] ],
      [ 64, [ 34, 4096, 16, 0, 0 ] ],
      [ 64, [ 38, 4096, 16, 0, 0 ] ],
      [ 64, [ 42, 4096, 16, 0, 0 ] ],
      [ 64, [ 46, 4096, 16, 0, 0 ] ],
      [ 64, [ 50, 4096, 16, 0, 0 ] ],
      [ 64, [ 54, 4096, 16, 0, 0 ] ],
      [ 64, [ 58, 4096, 16, 0, 0 ] ],
      [ 64, [ 62, 4096, 16, 0, 0 ] ],
      [ 64, [ 66, 4096, 16, 0, 0 ] ],
    ];
    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  pwmWrite: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.pwmWrite(j, 255);
    }

    var expects = [
      [ 64, [ 6, 4096, 16, 0, 0 ] ],
      [ 64, [ 10, 4096, 16, 0, 0 ] ],
      [ 64, [ 14, 4096, 16, 0, 0 ] ],
      [ 64, [ 18, 4096, 16, 0, 0 ] ],
      [ 64, [ 22, 4096, 16, 0, 0 ] ],
      [ 64, [ 26, 4096, 16, 0, 0 ] ],
      [ 64, [ 30, 4096, 16, 0, 0 ] ],
      [ 64, [ 34, 4096, 16, 0, 0 ] ],
      [ 64, [ 38, 4096, 16, 0, 0 ] ],
      [ 64, [ 42, 4096, 16, 0, 0 ] ],
      [ 64, [ 46, 4096, 16, 0, 0 ] ],
      [ 64, [ 50, 4096, 16, 0, 0 ] ],
      [ 64, [ 54, 4096, 16, 0, 0 ] ],
      [ 64, [ 58, 4096, 16, 0, 0 ] ],
      [ 64, [ 62, 4096, 16, 0, 0 ] ],
      [ 64, [ 66, 4096, 16, 0, 0 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  servoWrite: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.servoWrite(j, 180);
    }

    var expects = [
      [ 64, [ 6, 0, 0, 1023, 3 ] ],
      [ 64, [ 10, 0, 0, 1023, 3 ] ],
      [ 64, [ 14, 0, 0, 1023, 3 ] ],
      [ 64, [ 18, 0, 0, 1023, 3 ] ],
      [ 64, [ 22, 0, 0, 1023, 3 ] ],
      [ 64, [ 26, 0, 0, 1023, 3 ] ],
      [ 64, [ 30, 0, 0, 1023, 3 ] ],
      [ 64, [ 34, 0, 0, 1023, 3 ] ],
      [ 64, [ 38, 0, 0, 1023, 3 ] ],
      [ 64, [ 42, 0, 0, 1023, 3 ] ],
      [ 64, [ 46, 0, 0, 1023, 3 ] ],
      [ 64, [ 50, 0, 0, 1023, 3 ] ],
      [ 64, [ 54, 0, 0, 1023, 3 ] ],
      [ 64, [ 58, 0, 0, 1023, 3 ] ],
      [ 64, [ 62, 0, 0, 1023, 3 ] ],
      [ 64, [ 66, 0, 0, 1023, 3 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  analogWrite: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.analogWrite(j, 255);
    }

    var expects = [
      [ 64, [ 6, 4096, 16, 0, 0 ] ],
      [ 64, [ 10, 4096, 16, 0, 0 ] ],
      [ 64, [ 14, 4096, 16, 0, 0 ] ],
      [ 64, [ 18, 4096, 16, 0, 0 ] ],
      [ 64, [ 22, 4096, 16, 0, 0 ] ],
      [ 64, [ 26, 4096, 16, 0, 0 ] ],
      [ 64, [ 30, 4096, 16, 0, 0 ] ],
      [ 64, [ 34, 4096, 16, 0, 0 ] ],
      [ 64, [ 38, 4096, 16, 0, 0 ] ],
      [ 64, [ 42, 4096, 16, 0, 0 ] ],
      [ 64, [ 46, 4096, 16, 0, 0 ] ],
      [ 64, [ 50, 4096, 16, 0, 0 ] ],
      [ 64, [ 54, 4096, 16, 0, 0 ] ],
      [ 64, [ 58, 4096, 16, 0, 0 ] ],
      [ 64, [ 62, 4096, 16, 0, 0 ] ],
      [ 64, [ 66, 4096, 16, 0, 0 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  unsupported: function(test) {
    test.expect(8);

    sinon.spy(this.expander, "digitalRead");
    test.throws(this.expander.digitalRead);
    test.equal(
      this.expander.digitalRead.lastCall.exception.message,
      "Expander:PCA9685 does not support digitalRead"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:PCA9685 does not support analogRead"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:PCA9685 does not support i2cWrite"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:PCA9685 does not support i2cRead"
    );

    test.done();
  },
};


exports["Expander - PCF8591"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "PCF8591",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  fwdOptionsToi2cConfig: function(test) {
    test.expect(3);

    this.i2cConfig.reset();

    new Expander({
      controller: "PCF8591",
      address: 0xff,
      bus: "i2c-1",
      board: this.board
    });

    var forwarded = this.i2cConfig.lastCall.args[0];

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(forwarded.address, 0xff);
    test.equal(forwarded.bus, "i2c-1");

    test.done();
  },

  initialization: function(test) {
    test.expect(2);

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(this.i2cWrite.callCount, 1);

    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(5);

    this.i2cWrite.reset();

    for (var i = 0; i < 4; i++) {
      this.expander.pinMode(i, 2);
    }

    test.equal(this.expander.pins[0].mode, 2);
    test.equal(this.expander.pins[1].mode, 2);
    test.equal(this.expander.pins[2].mode, 2);
    test.equal(this.expander.pins[3].mode, 2);

    test.deepEqual(this.i2cWrite.callCount, 0);

    test.done();
  },

  analogRead: function(test) {
    test.expect(4);

    var spy = sinon.spy();

    for (var i = 0; i < 4; i++) {
      this.expander.pinMode(i, 2);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 4; j++) {
      this.expander.analogRead(j, spy);
    }

    var expects = [
      [ 72, 4 ],
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.equal(this.i2cRead.callCount, 1);

    var callback = this.i2cRead.lastCall.args[2];

    callback([0x00, 0x0f, 0xf0, 0xff]);

    test.equal(spy.callCount, 4);

    test.deepEqual(
      spy.args.map(function(args) { return args[0]; }),
      [0x00 << 2, 0x0f << 2, 0xf0 << 2, 0xff << 2]
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(8);

    sinon.spy(this.expander, "digitalRead");
    test.throws(this.expander.digitalRead);
    test.equal(
      this.expander.digitalRead.lastCall.exception.message,
      "Expander:PCF8591 does not support digitalRead"
    );

    sinon.spy(this.expander, "digitalWrite");
    test.throws(this.expander.digitalWrite);
    test.equal(
      this.expander.digitalWrite.lastCall.exception.message,
      "Expander:PCF8591 does not support digitalWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:PCF8591 does not support i2cWrite"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:PCF8591 does not support i2cRead"
    );

    test.done();
  },
};

exports["Expander - MUXSHIELD2"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.pinMode = sinon.spy(MockFirmata.prototype, "pinMode");
    this.digitalRead = sinon.spy(MockFirmata.prototype, "digitalRead");
    this.digitalWrite = sinon.spy(MockFirmata.prototype, "digitalWrite");
    this.analogRead = sinon.spy(MockFirmata.prototype, "analogRead");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "MUXSHIELD2",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    restore(this);
    done();
  },

  initialization: function(test) {
    test.expect(3);

    test.equal(this.pinMode.callCount, 8);
    test.deepEqual(this.pinMode.args, [
      [ 2, 1 ],
      [ 4, 1 ],
      [ 6, 1 ],
      [ 7, 1 ],
      [ 8, 1 ],
      [ 10, 1 ],
      [ 11, 1 ],
      [ 12, 1 ]
    ]);
    test.equal(this.digitalWrite.callCount, 1);
    test.done();
  },

  normalize: function(test) {
    test.expect(48);

    for (var i = 0; i < 48; i++) {
      test.equal(this.expander.normalize("XX" + i), "XX" + i);
    }

    test.done();
  },

  pinModeINPUT: function(test) {
    test.expect(1);

    this.pinMode.reset();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode("IO1-" + i, 0);
    }

    // pinMode only called ONCE per row!!
    test.deepEqual(this.pinMode.callCount, 1);

    test.done();
  },

  pinModeOUTPUT: function(test) {
    test.expect(2);

    this.pinMode.reset();
    this.digitalWrite.reset();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode("IO1-" + i, 1);
    }

    // pinMode only called ONCE per row!!
    test.deepEqual(this.pinMode.callCount, 1);
    test.deepEqual(this.digitalWrite.callCount, 1);

    test.done();
  },

  pinModeANALOG: function(test) {
    test.expect(1);

    this.pinMode.reset();
    this.digitalWrite.reset();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode("IO1-" + i, 2);
    }

    // pinMode never called for ANALOG
    test.deepEqual(this.pinMode.callCount, 0);

    test.done();
  },

  analogRead: function(test) {
    test.expect(2);

    var spy = sinon.spy();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode("IO1-" + i, 2);
    }

    this.analogRead.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.analogRead("IO1-" + j, spy);
    }

    // The board's analogRead is only called ONCE!
    test.equal(this.analogRead.callCount, 1);

    var callback = this.analogRead.lastCall.args[1];

    callback(1023);
    callback(1023);
    callback(1023);
    callback(1023);

    test.equal(spy.callCount, 4);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(2);

    var spy = sinon.spy();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode("IO1-" + i, 2);
    }

    this.digitalRead.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.digitalRead("IO1-" + j, spy);
    }

    // The board's digitalRead is only called ONCE!
    test.equal(this.digitalRead.callCount, 1);

    var callback = this.digitalRead.lastCall.args[1];

    callback(1);
    callback(1);
    callback(1);
    callback(1);

    test.equal(spy.callCount, 4);

    test.done();
  },

  digitalWrite: function(test) {
    // test.expect(2);

    this.digitalWrite.reset();

    // 1 call to set pin mode
    // 2 calls to enter OUTPUT mode: LCLK, MODE
    //
    // For Each 16 channels in a row:
    //  1 call to SCLK
    //  1 call to write value
    //  1 call to latch in value
    //
    // 2 calls to leave OUTPUT mode: LCLK, MODE
    // ---------
    // 53

    this.expander.pinMode("IO1-0", this.expander.MODES.OUTPUT);
    this.expander.digitalWrite("IO1-0", this.expander.HIGH);

    test.equal(this.digitalWrite.callCount, 53);

    test.equal(this.digitalWrite.getCall(0).args[1], 1);
    test.equal(this.digitalWrite.getCall(1).args[1], 0);
    test.equal(this.digitalWrite.getCall(2).args[1], 1);

    for (var i = 51; i < 51; i -= 3) {
      test.equal(this.digitalWrite.getCall(i).args[1], 1);

      // The bits are written backwards, so the last one is HIGH
      if (i === 49) {
        test.equal(this.digitalWrite.getCall(i + 1).args[1], 1);
      } else {
        // The rest are all still LOW
        test.equal(this.digitalWrite.getCall(i + 1).args[1], 0);
      }
      test.equal(this.digitalWrite.getCall(i + 2).args[1], 0);
    }

    test.equal(this.digitalWrite.getCall(51).args[1], 1);
    test.equal(this.digitalWrite.getCall(52).args[1], 0);

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);
    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:MUXSHIELD2 does not support analogWrite"
    );

    sinon.spy(this.expander, "pwmWrite");
    test.throws(this.expander.pwmWrite);
    test.equal(
      this.expander.pwmWrite.lastCall.exception.message,
      "Expander:MUXSHIELD2 does not support pwmWrite"
    );

    sinon.spy(this.expander, "i2cConfig");
    test.throws(this.expander.i2cConfig);
    test.equal(
      this.expander.i2cConfig.lastCall.exception.message,
      "Expander:MUXSHIELD2 does not support i2cConfig"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:MUXSHIELD2 does not support i2cWrite"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:MUXSHIELD2 does not support i2cRead"
    );

    test.done();
  },
};


exports["Expander - GROVEPI"] = {
  setUp: function(done) {
    this.sandbox = sinon.sandbox.create();

    this.clock = this.sandbox.useFakeTimers();
    this.i2cConfig = this.sandbox.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = this.sandbox.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cReadOnce = this.sandbox.spy(MockFirmata.prototype, "i2cReadOnce");

    this.board = newBoard();

    this.expander = new Expander({
      controller: "GROVEPI",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Board.purge();
    Expander.purge();
    this.sandbox.restore();
    done();
  },

  fwdOptionsToi2cConfig: function(test) {
    test.expect(3);

    this.i2cConfig.reset();

    new Expander({
      controller: "GROVEPI",
      address: 0xff,
      bus: "i2c-1",
      board: this.board
    });

    var forwarded = this.i2cConfig.lastCall.args[0];

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(forwarded.address, 0xff);
    test.equal(forwarded.bus, "i2c-1");

    test.done();
  },

  initialization: function(test) {
    test.expect(3);

    test.equal(this.i2cConfig.callCount, 1);
    test.equal(this.i2cWrite.callCount, 17);
    test.deepEqual(this.i2cWrite.args, [
      // pinMode(pin, OUTPUT)
      // [0x05, pin, 1, (empty)]
      [ 4, [ 5, 2, 1, 0 ] ],
      // digitalWrite(pin, LOW)
      // [0x02, pin, LOW, (empty)]
      [ 4, [ 2, 2, 0, 0 ] ],
      // pinMode(pin, OUTPUT)
      // [0x05, pin, 1, (empty)]
      [ 4, [ 5, 3, 1, 0 ] ],
      // digitalWrite(pin, LOW)
      // [0x02, pin, LOW, (empty)]
      [ 4, [ 2, 3, 0, 0 ] ],
      // pinMode(pin, OUTPUT)
      // [0x05, pin, 1, (empty)]
      [ 4, [ 5, 4, 1, 0 ] ],
      // digitalWrite(pin, LOW)
      // [0x02, pin, LOW, (empty)]
      [ 4, [ 2, 4, 0, 0 ] ],
      // pinMode(pin, OUTPUT)
      // [0x05, pin, 1, (empty)]
      [ 4, [ 5, 5, 1, 0 ] ],
      // digitalWrite(pin, LOW)
      // [0x02, pin, LOW, (empty)]
      [ 4, [ 2, 5, 0, 0 ] ],
      // pinMode(pin, OUTPUT)
      // [0x05, pin, 1, (empty)]
      [ 4, [ 5, 6, 1, 0 ] ],
      // digitalWrite(pin, LOW)
      // [0x02, pin, LOW, (empty)]
      [ 4, [ 2, 6, 0, 0 ] ],
      // pinMode(pin, OUTPUT)
      // [0x05, pin, 1, (empty)]
      [ 4, [ 5, 7, 1, 0 ] ],
      // digitalWrite(pin, LOW)
      // [0x02, pin, LOW, (empty)]
      [ 4, [ 2, 7, 0, 0 ] ],
      // pinMode(pin, OUTPUT)
      // [0x05, pin, 1, (empty)]
      [ 4, [ 5, 8, 1, 0 ] ],
      // digitalWrite(pin, LOW)
      // [0x02, pin, LOW, (empty)]
      [ 4, [ 2, 8, 0, 0 ] ],

      // Analog pins are set to INPUT (0)
      // pinMode(pin, ANALOG => INPUT)
      // [0x05, pin, INPUT, (empty)]
      [ 4, [ 5, 14, 0, 0 ] ],
      // pinMode(pin, ANALOG => INPUT)
      // [0x05, pin, INPUT, (empty)]
      [ 4, [ 5, 15, 0, 0 ] ],
      // pinMode(pin, ANALOG => INPUT)
      // [0x05, pin, INPUT, (empty)]
      [ 4, [ 5, 16, 0, 0 ] ],
    ]);
    test.done();
  },

  isTypeOverridePWM: function(test) {
    test.expect(7);

    test.equal(this.expander.isPwm("D2"), false);
    test.equal(this.expander.isPwm("D4"), false);
    test.equal(this.expander.isPwm("D7"), false);
    test.equal(this.expander.isPwm("D8"), false);

    test.equal(this.expander.isPwm("D3"), true);
    test.equal(this.expander.isPwm("D5"), true);
    test.equal(this.expander.isPwm("D6"), true);

    test.done();
  },


  normalize: function(test) {
    test.expect(16);

    for (var i = 0; i < 16; i++) {
      test.equal(this.expander.normalize("D" + i), "D" + i);
    }

    test.done();
  },

  pinModeINPUT: function(test) {
    test.expect(2);

    this.i2cWrite.reset();

    for (var i = 2; i < 9; i++) {
      this.expander.pinMode("D" + i, this.expander.MODES.INPUT);
    }

    test.equal(this.i2cWrite.callCount, 7);
    test.deepEqual(this.i2cWrite.args, [
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 2, 0, 0 ] ],
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 3, 0, 0 ] ],
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 4, 0, 0 ] ],
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 5, 0, 0 ] ],
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 6, 0, 0 ] ],
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 7, 0, 0 ] ],
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 8, 0, 0 ] ],
    ]);

    test.done();
  },

  pinModeANALOG: function(test) {
    test.expect(2);

    this.i2cWrite.reset();

    for (var i = 0; i < 3; i++) {
      this.expander.pinMode("A" + i, this.expander.MODES.ANALOG);
    }

    test.equal(this.i2cWrite.callCount, 3);
    test.deepEqual(this.i2cWrite.args, [
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 14, 0, 0 ] ],
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 15, 0, 0 ] ],
      // pinMode(pin, INPUT)
      // [0x05, pin, 0, (empty)]
      [ 4, [ 5, 16, 0, 0 ] ],
    ]);

    test.done();
  },

  analogRead: function(test) {
    test.expect(27);

    var spies = [
      this.sandbox.spy(),
      this.sandbox.spy(),
      this.sandbox.spy(),
    ];
    var callbacks = [];
    var on = this.sandbox.spy(this.expander, "on");

    for (var i = 0; i < 3; i++) {
      this.expander.pinMode("A" + i, this.expander.MODES.ANALOG);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 3; j++) {
      this.expander.analogRead("A" + j, spies[j]);
    }

    test.equal(this.i2cWrite.callCount, 1);
    test.equal(this.i2cReadOnce.callCount, 1);


    callbacks[0] = this.i2cReadOnce.lastCall.args[2];
    callbacks[0]([0, 3, 255, 255]);
    this.clock.tick(1);
    test.equal(this.i2cReadOnce.callCount, 2);
    test.equal(spies[0].callCount, 1);
    test.equal(spies[1].callCount, 0);
    test.equal(spies[2].callCount, 0);


    callbacks[1] = this.i2cReadOnce.lastCall.args[2];
    callbacks[1]([0, 3, 255, 255]);
    this.clock.tick(1);
    test.equal(this.i2cReadOnce.callCount, 3);
    test.equal(spies[0].callCount, 1);
    test.equal(spies[1].callCount, 1);
    test.equal(spies[2].callCount, 0);


    callbacks[2] = this.i2cReadOnce.lastCall.args[2];
    callbacks[2]([0, 3, 255, 255]);
    this.clock.tick(1);
    test.equal(this.i2cReadOnce.callCount, 4);
    test.equal(spies[0].callCount, 1);
    test.equal(spies[1].callCount, 1);
    test.equal(spies[2].callCount, 1);


    test.equal(on.callCount, 3);

    test.equal(on.getCall(0).args[0], "analog-read-14");
    test.equal(on.getCall(0).args[1], spies[0]);

    test.equal(on.getCall(1).args[0], "analog-read-15");
    test.equal(on.getCall(1).args[1], spies[1]);

    test.equal(on.getCall(2).args[0], "analog-read-16");
    test.equal(on.getCall(2).args[1], spies[2]);

    on.getCall(0).args[1](1023);
    on.getCall(1).args[1](1023);
    on.getCall(2).args[1](1023);

    test.equal(spies[0].callCount, 2);
    test.equal(spies[0].lastCall.args[0], 1023);
    test.equal(spies[1].callCount, 2);
    test.equal(spies[1].lastCall.args[0], 1023);
    test.equal(spies[2].callCount, 2);
    test.equal(spies[2].lastCall.args[0], 1023);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(45);

    var spies = [null, null].concat(Array.from({length: 7}, function() {
      return this.sandbox.spy();
    }.bind(this)));

    var callbacks = [];
    var on = this.sandbox.spy(this.expander, "on");

    for (var i = 2; i < 9; i++) {
      this.expander.pinMode("D" + i, this.expander.MODES.INPUT);
    }

    this.i2cWrite.reset();

    for (var j = 2; j < 9; j++) {
      this.expander.digitalRead("D" + j, spies[j]);
    }

    test.equal(this.i2cWrite.callCount, 1);
    test.equal(this.i2cReadOnce.callCount, 1);

    for (var k = 2; k < 9; k++) {
      callbacks[k] = this.i2cReadOnce.lastCall.args[2];
      callbacks[k]([1]);
      this.clock.tick(1);
      test.equal(this.i2cReadOnce.callCount, k);
      test.equal(spies[k].callCount, 1);
    }

    test.equal(on.callCount, 7);

    for (var l = 2; l < 9; l++) {
      test.equal(on.getCall(l - 2).args[0], "digital-read-" + l);
      test.equal(on.getCall(l - 2).args[1], spies[l]);

      on.getCall(l - 2).args[1](1);

      test.equal(spies[l].callCount, 2);
      test.equal(spies[l].lastCall.args[0], 1);
    }

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(8);

    for (var i = 2; i < 9; i++) {
      this.expander.pinMode("D" + i, this.expander.MODES.OUTPUT);
    }

    this.i2cWrite.reset();

    for (var j = 2; j < 9; j++) {
      this.expander.digitalWrite("D" + j, 1);
    }

    test.equal(this.i2cWrite.callCount, 7);

    // 0x02 => DIGITAL_WRITE
    test.deepEqual(this.i2cWrite.getCall(0).args[1], [0x02, 2, 1, 0]);
    test.deepEqual(this.i2cWrite.getCall(1).args[1], [0x02, 3, 1, 0]);
    test.deepEqual(this.i2cWrite.getCall(2).args[1], [0x02, 4, 1, 0]);
    test.deepEqual(this.i2cWrite.getCall(3).args[1], [0x02, 5, 1, 0]);
    test.deepEqual(this.i2cWrite.getCall(4).args[1], [0x02, 6, 1, 0]);
    test.deepEqual(this.i2cWrite.getCall(5).args[1], [0x02, 7, 1, 0]);
    test.deepEqual(this.i2cWrite.getCall(6).args[1], [0x02, 8, 1, 0]);

    test.done();
  },

  analogWrite: function(test) {
    test.expect(3);

    this.pwmWrite = this.sandbox.stub(this.expander, "pwmWrite");

    this.expander.analogWrite("D3", 255);

    test.equal(this.pwmWrite.callCount, 1);
    test.equal(this.pwmWrite.lastCall.args[0], "D3");
    test.equal(this.pwmWrite.lastCall.args[1], 255);

    test.done();
  },

  pwmWrite: function(test) {
    test.expect(10);

    this.expander.pinMode("D3", this.expander.MODES.PWM);
    this.expander.pinMode("D5", this.expander.MODES.PWM);
    this.expander.pinMode("D6", this.expander.MODES.PWM);

    this.i2cWrite.reset();

    this.expander.pwmWrite("D3", 255);
    this.expander.pwmWrite("D5", 255);
    this.expander.pwmWrite("D6", 255);

    test.equal(this.i2cWrite.callCount, 3);

    test.deepEqual(this.i2cWrite.getCall(0).args[1], [0x04, 3, 255, 0]);
    test.deepEqual(this.i2cWrite.getCall(1).args[1], [0x04, 5, 255, 0]);
    test.deepEqual(this.i2cWrite.getCall(2).args[1], [0x04, 6, 255, 0]);

    this.expander.pwmWrite("D3", 4096);
    this.expander.pwmWrite("D5", 4096);
    this.expander.pwmWrite("D6", 4096);

    // Out of range clamped to 255
    test.deepEqual(this.i2cWrite.getCall(3).args[1], [0x04, 3, 255, 0]);
    test.deepEqual(this.i2cWrite.getCall(4).args[1], [0x04, 5, 255, 0]);
    test.deepEqual(this.i2cWrite.getCall(5).args[1], [0x04, 6, 255, 0]);

    this.expander.pwmWrite("D3", -1);
    this.expander.pwmWrite("D5", -1);
    this.expander.pwmWrite("D6", -1);

    // Out of range clamped to 0
    test.deepEqual(this.i2cWrite.getCall(6).args[1], [0x04, 3, 0, 0]);
    test.deepEqual(this.i2cWrite.getCall(7).args[1], [0x04, 5, 0, 0]);
    test.deepEqual(this.i2cWrite.getCall(8).args[1], [0x04, 6, 0, 0]);

    test.done();
  },
  unsupported: function(test) {
    test.expect(8);

    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:GROVEPI does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cConfig");
    test.throws(this.expander.i2cConfig);
    test.equal(
      this.expander.i2cConfig.lastCall.exception.message,
      "Expander:GROVEPI does not support i2cConfig"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:GROVEPI does not support i2cWrite"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:GROVEPI does not support i2cRead"
    );

    test.done();
  },
};
