'use strict';

import Homey from 'homey';
import { createSocket } from 'dgram';

const DISCOVERY_PORT = 5048;
const DISCOVERY_ADDR = '255.255.255.255';
const DISCOVERY_MSG = Buffer.from('4d41444100000083010050', 'hex');
const DISCOVERY_RESP = '4d41444100000083010060';

type DeviceData = {
    name: string;
    data: { id: string };
    settings: { address: string; port: number };
};

class Driver extends Homey.Driver {
    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('Driver has been initialized');
    }

    async onPairListDevices(): Promise<DeviceData[]> {
        const socket = createSocket({ type: 'udp4', reuseAddr: true });
        const devices: DeviceData[] = [];

        socket.on('error', (err) => {
            this.log('Socket error:', err);
            socket.close();
        });

        socket.on('message', (msg, rinfo) => {
            const response = msg.toString('hex');
            if (response.startsWith(DISCOVERY_RESP)) {
                const name = Buffer.from(
                    response.slice(166 + 10),
                    'hex'
                ).toString();

                this.log('Discovered device:', name, rinfo);
                devices.push({
                    name,
                    data: {
                        id: rinfo.address,
                    },
                    settings: {
                        address: rinfo.address,
                        port: 502,
                    },
                });
            }
        });

        socket.on('listening', () => {
            this.log('Socket listening:', socket.address());
            socket.setBroadcast(true);
            socket.send(
                DISCOVERY_MSG,
                0,
                DISCOVERY_MSG.length,
                DISCOVERY_PORT,
                DISCOVERY_ADDR,
                () => {
                    this.log('Sent discovery message');
                }
            );
        });

        socket.bind(DISCOVERY_PORT);
        return new Promise((resolve) => {
            this.homey.setTimeout(() => {
                socket.close();
                resolve(devices);
            }, 3000);
        });
    }
}

module.exports = Driver;
