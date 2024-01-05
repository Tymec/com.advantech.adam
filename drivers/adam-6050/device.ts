'use strict';

import Homey from 'homey';
import { Socket } from 'net';
import { client as Client } from 'jsmodbus';

class Device extends Homey.Device {
    private pollingInterval: NodeJS.Timeout | null = null;

    private setDigitalInput(i: number, state: boolean) {
        if (i < 0 || i > 11) return;
        if (!this.hasCapability(`digital_input.${i}`)) return;
        this.setCapabilityValue(`digital_input.${i}`, state).catch(this.error);
    }

    private setDigitalOutput(i: number, state: boolean) {
        if (i < 0 || i > 5) return;
        if (!this.hasCapability(`digital_output.${i}`)) return;
        this.setCapabilityValue(`digital_output.${i}`, state).catch(this.error);
    }

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        // https://github.com/ricott/sma.modbus/blob/master/drivers/storage/device.js
        this.log('Device has been initialized');

        const options = {
            host: this.getSetting('address'),
            port: this.getSetting('port'),
            unitId: 3,
            timeout: 5000,
            autoReconnect: true,
            reconnectTimeout: this.getSetting('polling'),
        };

        const socket = new Socket();
        const client = new Client.TCP(socket, 3);

        socket.on('connect', () => {
            this.log('Connected to Modbus TCP');

            this.pollingInterval = this.homey.setInterval(
                () => {
                    client.readCoils(0, 12).then((resp) => {
                        const values = resp.response.body.valuesAsArray;

                        for (let i = 0; i < 12; i++) {
                            this.setDigitalInput(i, Boolean(values[i]));
                        }
                    }, console.error);

                    client.readCoils(16, 6).then((resp) => {
                        const values = resp.response.body.valuesAsArray;

                        for (let i = 0; i < 6; i++) {
                            this.setDigitalOutput(i, Boolean(values[i]));
                        }
                    }, console.error);
                },
                this.getSetting('polling') * 1000
            );

            const addDigitalOutput = async (i: number) => {
                const label = this.getSetting(`do${i}_name`);
                const enabled = this.getSetting(`do${i}_enable`);

                if (!enabled) return;

                await this.setCapabilityOptions(`digital_output.${i}`, {
                    title: label,
                });

                this.registerCapabilityListener(
                    `digital_output.${i}`,
                    async (value: boolean) => {
                        await client.writeSingleCoil(16 + i, value);
                    }
                );
            };

            for (let i = 0; i < 6; i++) {
                addDigitalOutput(i).catch(this.error);
            }
        });

        socket.on('error', (err) => {
            this.log(err);
            socket.end();
        });

        socket.on('close', () => {
            this.log('Client closed, retrying in 63 seconds');

            this.homey.clearInterval(this.pollingInterval);
            this.homey.setTimeout(() => {
                socket.connect(options);
                this.log('Reconnecting now ...');
            }, 63000);
        });

        socket.connect(options);
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log('Device has been added');

        for (let i = 0; i < 12; i++) {
            if (this.getSetting(`do${i}_enable`)) {
                await this.addCapability(`digital_output.${i}`);
                await this.setCapabilityOptions(`digital_output.${i}`, {
                    title: this.getSetting(`do${i}_name`),
                });
            }
        }
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({
        oldSettings,
        newSettings,
        changedKeys,
    }: {
        oldSettings: {
            [key: string]: boolean | string | number | undefined | null;
        };
        newSettings: {
            [key: string]: boolean | string | number | undefined | null;
        };
        changedKeys: string[];
    }): Promise<string | void> {
        this.log('Device settings where changed');

        // Connection settings
        if (changedKeys.includes('address') || changedKeys.includes('port')) {
            // TODO: reconnect
        }

        // Digital output labels
        if (
            changedKeys.includes('do0_name') &&
            this.hasCapability('digital_output.0')
        ) {
            await this.setCapabilityOptions('digital_output.0', {
                title: newSettings.do0_name,
            });
        }

        // Polling interval
        if (changedKeys.includes('polling')) {
            // this.homey.clearInterval(this.pollingInterval);
            // TODO: change polling interval
        }
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name: string) {
        this.log('Device was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.log('Device has been deleted');

        this.homey.clearInterval(this.pollingInterval);
    }
}

module.exports = Device;
