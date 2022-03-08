var Service, Characteristic;
const { setDebugEnabled } = require('homebridge/lib/logger');
const WebsocketTransceiver = require('./tc-websocket');
var sentCodes = [];

/** PLATFORM CLASS **/
function BmmIotPlatform (log, config) {
    const self = this;
    self.log = log;
    self.config = config;
    var ioTimeout = 100;
    if (config.input_output_timeout) ioTimeout = config.input_output_timeout;
    if (config.host) {
        const host = config.host;
        const port = config.port ? config.port : 80;
        self.log('Starting on host :', host + ':' + port);
        self.transcriver = new WebsocketTransceiver(self.log, host, port, ioTimeout);
    }
}
BmmIotPlatform.prototype.listen = function () {
    if(!this.transcriver) return;
    this.transcriver.setCallback(this.receiveMessage.bind(this));
    this.transcriver.init();
}
BmmIotPlatform.prototype.accessories = function (callback) {
    const self = this;
    self.accessories = [];
    if (self.config.switches) {
        self.config.switches.forEach(function (sw) {
            self.accessories.push(new SwitchAccessory(sw, self.log, self.config, self.transcriver));
        });
    }
    if (self.config.buttons) {
        self.config.buttons.forEach(function (sw) {
            self.accessories.push(new ButtonAccessory(sw, self.log, self.config));
        });
    }
    if (self.config.lights) {
      self.config.lights.forEach(function (sw) {
          self.accessories.push(new LightAccessory(sw, self.log, self.config, self.transcriver));
      });
    }
    self.log(self.accessories);
    setTimeout(self.listen.bind(self), 10);
    callback(self.accessories);    
};

/*SEND DEVICE_ID ON DEVICE STARTUP*/
BmmIotPlatform.prototype.receiveMessage = function (value) {
    // console.log("mensagem recebida:", value);
    const self = this;
    var found = false;

    if (value.deviceId){
      self.accessories.forEach(function (accessory) {
        if (accessory.update(value)) found = true;
        return;
      });
    } else if (!checkCode(value, sentCodes, false) && self.accessories) {
        self.accessories.forEach(function (accessory) {
          if (accessory.notify.call(accessory, value)) found = true;
        });
      } else {
        found = true;
      }
      if (!found) {
        try {
          self.log(JSON.stringify(value));
        } catch (e) { this.log(e); }
      }
    };

  module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform('homebridge-bmm-iot', 'BMMIot', BmmIotPlatform);
  };

/** SWITCH ACCESSORY CLASS **/
function SwitchAccessory (sw, log, config, transceiver) {
    const self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.transceiver = transceiver;
    self.currentState = false;
    self.throttle = config.throttle ? config.throttle : 500;
  
    self.service = new Service.Switch(self.name);
  
    self.service.getCharacteristic(Characteristic.On).value = self.currentState;
  
    self.service.getCharacteristic(Characteristic.On).on('get', function (cb) {
      cb(null, self.currentState);
    });
  
    self.service.getCharacteristic(Characteristic.On).on('set', function (state, cb) {
      self.currentState = state;
      if (self.currentState) {
        const out = getSendObject(self.sw, true);
        addCode(out, sentCodes);
        self.transceiver.send(out);
        self.log('Sent on code for %s', self.sw.name);
      } else {
        const out = getSendObject(self.sw, false);
        addCode(out, sentCodes);
        self.transceiver.send(out);
        self.log('Sent off code for %s', self.sw.name);
      }
      cb(null);
    });
    self.notifyOn = helpers.throttle(function () {
      self.log('Received on code for %s', self.sw.name);
      self.currentState = true;
      self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
    }, self.throttle, self);
    self.notifyOff = helpers.throttle(function () {
      self.log('Received off code for %s', self.sw.name);
      self.currentState = false;
      self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
    }, self.throttle, self);
}

SwitchAccessory.prototype.update = function (message) {
  if (message.deviceId === 1323) {
    this.log("rodou 1");
    return true;
  }
  return false;
};
SwitchAccessory.prototype.notify = function (message) {
  if (isSameAsSwitch(message, this.sw)) {
    if (getSwitchState(message, this.sw)) {
      this.notifyOn();
    } else {
      this.notifyOff();
    }
    return true;
  }
  return false;
};
SwitchAccessory.prototype.getServices = function () {
  const self = this;
  var services = [];
  var service = new Service.AccessoryInformation();
  service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, 'BMM')
    .setCharacteristic(Characteristic.Model, 'BMM-Switch')
    .setCharacteristic(Characteristic.HardwareRevision, '0.0.1');
  services.push(service);
  services.push(self.service);
  return services;
};
/** BUTTON ACCESSORY CLASS **/    
function ButtonAccessory (sw, log, config) {
  const self = this;
  self.name = sw.name;
  self.sw = sw;
  self.log = log;
  self.config = config;
  self.currentState = false;
  self.throttle = config.throttle ? config.throttle : 500;

  self.service = new Service.Switch(self.name);

  self.service.getCharacteristic(Characteristic.On).value = self.currentState;

  self.service.getCharacteristic(Characteristic.On).on('get', function (cb) {
    cb(null, self.currentState);
  });

  self.service.getCharacteristic(Characteristic.On).on('set', function (state, cb) {
    self.currentState = state;
    if (state) {
      setTimeout(this.resetButton.bind(this), 1000);
    }
    cb(null);
  }.bind(self));

  self.notifyOn = helpers.throttle(function () {
    this.log('Received button code for %s', this.sw.name);
    this.currentState = true;
    this.service.getCharacteristic(Characteristic.On).updateValue(this.currentState);
    setTimeout(this.resetButton.bind(this), 1000);
  }, self.throttle, self);
}
ButtonAccessory.prototype.update = function (message) {
  if (message.deviceId === 1123) {
    this.log("rodou 2");
    return true;
  }
  return false;
};
ButtonAccessory.prototype.notify = function (message) {
if (isSameAsSwitch(message, this.sw, true)) {
    this.notifyOn();
    return true;
}
return false;
};
ButtonAccessory.prototype.resetButton = function () {
this.currentState = false;
this.service.getCharacteristic(Characteristic.On).updateValue(this.currentState);
};
ButtonAccessory.prototype.getServices = function () {
const self = this;
var services = [];
var service = new Service.AccessoryInformation();
service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, 'BMM')
    .setCharacteristic(Characteristic.Model, 'BMM-Button')
    .setCharacteristic(Characteristic.HardwareRevision, '0.0.1');
services.push(service);
services.push(self.service);
return services;
};

/** LIGHT ACCESSORY CLASS **/
function LightAccessory (sw, log, config, transceiver){
  const self = this;
  self.name = sw.name;
  self.sw = sw;
  self.log = log;
  self.config = config;
  self.transceiver = transceiver;
  self.currentState = false;
  self.msg = {};
  self.currenthue = 0;
  self.currentSaturation = 0;
  self.currentBrightness = 0;
  self.throttle = config ? config.throttle : 500;

  self.service = new Service.Lightbulb(self.name);

  self.service.getCharacteristic(Characteristic.On).value = self.currentState;
  this.log("SW:", this.sw);

  // self.service.getCharacteristic(Characteristic.On)
  //   .on('get', self.getRgb.bind(self, 'o'))
  //   .on('set', self.setRgb.bind(self, 'o'));

  if (self.sw.type === 'rgb'){
    self.service.getCharacteristic(Characteristic.On)
    .on('get', self.getRgb.bind(self, 'o'))
    .on('set', self.setRgb.bind(self, 'o'));

    self.service.addCharacteristic(new Characteristic.Hue())
    .on('get', self.getRgb.bind(self, 'h'))
    .on('set', self.setRgb.bind(self, 'h'));

    self.service.addCharacteristic(new Characteristic.Saturation())
    .on('get', self.getRgb.bind(self, 's'))
    .on('set', self.setRgb.bind(self, 's'));

    self.service.addCharacteristic(new Characteristic.Brightness())
    .on('get', self.getRgb.bind(self, 'v'))
    .on('set', self.setRgb.bind(self, 'v'));
  } else if (self.sw.type === 'modes_light') {
    self.service.getCharacteristic(Characteristic.On)
    .on('get', self.getRgb.bind(self, 'm'))
    .on('set', self.setRgb.bind(self, 'm'));
  }
  self.notifyOn = helpers.throttle(function () {
    self.log('Received on code for %s', self.sw.name);
    self.currentState = true;
    self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
  }, self.throttle, self);
  self.notifyOff = helpers.throttle(function () {
    self.log('Received off code for %s', self.sw.name);
    self.currentState = false;
    self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
  }, self.throttle, self);
}
LightAccessory.prototype.getRgb = function (param, callback) {
  // this.log('get param: ', param);
  this.msg = {};
  this.msg.deviceId = this.config.deviceId;
  this.msg.request = 'g';
  this.msg.param = param;
  this.log("Get param:", this.msg);
  this.transceiver.send(this.msg);
  callback(null, this.currentBrightness);
};
LightAccessory.prototype.setRgb = function (param, level, callback) {
  // this.currentBrightness = 100;
  // this.log('set param:', param, 'level:', level);
  this.msg = {};
  this.msg.deviceId = this.config.deviceId;
  this.msg.request = 's';
  this.msg.param = param;
  this.msg.level = level;
  this.transceiver.send(this.msg);
  this.log('Set Message: ',this.msg)
  callback(null);
};
// This part updates based on message received from ESP
LightAccessory.prototype.update = function (message) {
  this.log("Update:", message);
  if (message.deviceId === this.config.deviceId) {
    if (message.param === 'o'){
      this.log("menssagem O:", message);
      // if (message.level === 'true'){
      //   this.service.getCharacteristic(Characteristic.On).updateValue(true);  
      // } else{
      //   this.service.getCharacteristic(Characteristic.On).updateValue(false);
      // }
      // this.service.getCharacteristic(Characteristic.On).updateValue(message.value);
    }
    if (message.param === 'm'){
      this.log("menssagem M:", message);
      // this.service.getCharacteristic(Characteristic.On).updateValue(message.value);
    }
      return true;
  }
  return false;
};
LightAccessory.prototype.notify = function (message) {
  this.log("RECEIVED MESSAGE:", message);
if (isSameAsSwitch(message, this.sw)) {
  if (getSwitchState(message, this.sw)) {
    this.notifyOn();
  } else {
    this.notifyOff();
  }
  return true;
}
return false;
};
LightAccessory.prototype.getServices = function () {
  const self = this;
  var services = [];
  var service = new Service.AccessoryInformation();
  service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, 'BMM')
    .setCharacteristic(Characteristic.Model, 'BMM-Light')
    .setCharacteristic(Characteristic.HardwareRevision, '0.0.1');
  services.push(service);
  services.push(self.service);
  return services;
};
/** HELPERS SECTION **/
var helpers = {
    throttle: function (fn, threshold, scope) {
      threshold || (threshold = 250);
      var last;
  
      return function () {
        var context = scope || this;
        var now = +new Date(); var args = arguments;
  
        if (last && now < last + threshold) {
        } else {
          last = now;
          fn.apply(context, args);
        }
      };
    }
  };
  
  function checkCode (value, array, remove) {
    var index = array.findIndex(imSameMessage, value);
    if (index > -1) {
      if (remove) array.splice(index, 1);
      return true;
    } else {
      return false;
    }
  }
  
  function addCode (value, array) {
    array.push(value);
    setTimeout(checkCode, 2000, value, array, true);
  }
  
  function getSwitchState (message, sw) {
    if (message.code && sw.on) {
      if (message.code === sw.on.code) return true;
    } else if (message.code && sw.off) {
      if (message.code === sw.off.code) return false;
    } else if (message.code && sw.code) {
      if (message.code === sw.code) return true;
    } else if (message.message && message.message.state) {
      const state = message.message.state;
      if (state === 'on') return true;
      if (state === 'off') return false;
      if (state === 'up') return true;
      if (state === 'down') return false;
      if (state === 1) return true;
      if (state === 0) return false;
      if (state === '1') return true;
      if (state === '0') return false;
    }
    return false;
  }
  
  function imSameMessage (message) {
    // int idx = sentCodes.findIndex(imSameMessage, sw);
    // "this" is compare message info or switch info
    return isSameMessage(message, this, true);
  }

  function isSameMessage (message, prototype, compareState = false) {
    if (!message || !prototype) return;
    if (message.code && prototype.code) {
      if (prototype.code == message.code) return true;
    } else if (message.code && prototype.on) {
      if (prototype.on.code == message.code) return true;
    } else if (message.code && prototype.off) {
      if (prototype.off.code == message.code) return true;
    }
    // TODO: other kinds of espilight messages without id/unit
    else if (message.type && prototype.type) {
      if (prototype.type == message.type &&
          prototype.message.id == message.message.id &&
          prototype.message.unit == message.message.unit) {
        if (compareState) {
          if (prototype.message.state == message.message.state) {
            return true;
          }
        } else return true;
      }
    }
    return false;
  }

  // make a new object to send
  function getSendObject (sw, on = undefined) {
    var out = {};
    if (sw.on && on === true) {
      out.code = sw.on.code;
      out.pulse = sw.on.pulse;
      out.protocol = sw.on.protocol ? sw.on.protocol : 1;
    } else if (sw.off && on === false) {
      out.code = sw.off.code;
      out.pulse = sw.off.pulse;
      out.protocol = sw.off.protocol ? sw.off.protocol : 1;
    } else if (sw.code) {
      out.code = sw.code;
      out.pulse = sw.pulse;
      out.protocol = sw.protocol ? sw.protocol : 1;
    } else if (sw.type && sw.message) { // different for on/off switches
      out.type = sw.type;
      out.message = makeTransmitMessage(sw.message, on);
    }
    return out;
  }
  // change message from "state":"off" to "off":1 etc.
  // if on is undefined use state, else change to value of on
  function makeTransmitMessage (message, on = undefined) {
    if (!message) return message;
    try {
      var clonedMessage = JSON.parse(JSON.stringify(message));
    } catch (e) { this.log(e); }
    if (!clonedMessage) return {};
    if (clonedMessage.state) {
      const state = clonedMessage.state;
      if (state === 'on') {
        if (on === undefined) {
          clonedMessage.on = 1;
        } else if (on) {
          clonedMessage.on = 1;
        } else {
          clonedMessage.off = 1;
        }
      } else if (state === 'up') {
        if (on === undefined) {
          clonedMessage.up = 1;
        } else if (on) {
          clonedMessage.up = 1;
        } else {
          clonedMessage.down = 1;
        }
      } else if (state === 'off') {
        if (on === undefined) {
          clonedMessage.off = 1;
        } else if (on) {
          clonedMessage.on = 1;
        } else {
          clonedMessage.off = 1;
        }
      } else if (state === 'down') {
        if (on === undefined) {
          clonedMessage.down = 1;
        } else if (on) {
          clonedMessage.up = 1;
        } else {
          clonedMessage.down = 1;
        }
      } else if (on) {
        clonedMessage.on = 1;
      } else if (on !== undefined) {
        clonedMessage.off = 1;
      }
      delete clonedMessage.state;
    } else if (on) {
      clonedMessage.on = 1;
    } else if (on !== undefined) {
      clonedMessage.off = 1;
    }
    // make id and unit numbers if possible
    if (clonedMessage.id) {
      const conv = Number(clonedMessage.id);
      if (!Number.isNaN(conv)) {
        clonedMessage.id = conv;
      }
    }
    if (clonedMessage.unit) {
      const conv = Number(clonedMessage.unit);
      if (!Number.isNaN(conv)) {
        clonedMessage.unit = conv;
      }
    }
    return clonedMessage;
  }