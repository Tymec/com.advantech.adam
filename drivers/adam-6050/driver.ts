'use strict';

import Homey from 'homey';

class Driver extends Homey.Driver {
    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('Driver has been initialized');
    }
}

module.exports = Driver;
