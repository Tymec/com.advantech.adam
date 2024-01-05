'use strict';

import Homey from 'homey';
import { Socket } from 'net';
import { client as Client } from 'jsmodbus';

// TODO: Handle modbus connection loss
class Device extends Homey.Device {
    private pollingInterval: NodeJS.Timeout | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    async onInit() {
        this.log('Device has been initialized');

        const clientSocket = new Socket();
        const clientConnection = new Client.TCP(clientSocket, 3); // NOTE: what is unitId and should timeout be used?

        clientSocket.on('connect', () => {
            this.log('Connected to Modbus TCP');

            this.pollingInterval = this.homey.setInterval(
                () => {
                    // if not connected, do nothing
                    if (this.reconnectTimeout !== null) {
                        this.setWarning('Not connected').catch(this.error);
                        return;
                    }

                    clientConnection.readCoils(0, 12).then((resp) => {
                        const values = resp.response.body.valuesAsArray;

                        for (let i = 0; i < 12; i++) {
                            this.setDigitalInput(i, Boolean(values[i]));
                        }
                    }, console.error);

                    clientConnection.readCoils(16, 6).then((resp) => {
                        const values = resp.response.body.valuesAsArray;

                        for (let i = 0; i < 6; i++) {
                            this.setDigitalOutput(i, Boolean(values[i]));
                        }
                    }, console.error);
                },
                this.getSetting('polling') * 1000
            );

            const addDigitalOutput = async (i: number) => {
                // await this.setCapabilityOptions(`digital_output.${i}`, {
                //     // title: `Digital Output ${i}`,
                // });

                this.registerCapabilityListener(
                    `digital_output.${i}`,
                    async (value: boolean) => {
                        await clientConnection.writeSingleCoil(16 + i, value);
                    }
                );
            };

            for (let i = 0; i < 6; i++) {
                addDigitalOutput(i).catch(this.error);
            }
        });

        clientSocket.on('error', (err) => {
            this.error(err);
            this.homey.clearInterval(this.pollingInterval);
            this.homey.clearTimeout(this.reconnectTimeout);
        });

        const connect = () => {
            clientSocket.connect({
                host: this.getSetting('address'),
                port: this.getSetting('port'),
            });
        };

        clientSocket.on('close', () => {
            const timeout = this.getSetting('timeout');
            this.log(`Client closed, retrying in ${timeout} seconds`);

            this.reconnectTimeout = this.homey.setTimeout(
                connect,
                timeout * 1000
            );
        });

        connect();
    }

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

        // NOTE: For now, app restart is required for changes to take effect
    }

    async onDeleted() {
        this.log('Device has been deleted');
        this.homey.clearInterval(this.pollingInterval);
        this.homey.clearTimeout(this.reconnectTimeout);
    }

    private setDigitalInput(i: number, state: boolean): void {
        if (i < 0 || i > 11) return;
        if (!this.hasCapability(`digital_input.${i}`)) return;
        this.setCapabilityValue(`digital_input.${i}`, state).catch(this.error);
    }

    private setDigitalOutput(i: number, state: boolean): void {
        if (i < 0 || i > 5) return;
        if (!this.hasCapability(`digital_output.${i}`)) return;
        this.setCapabilityValue(`digital_output.${i}`, state).catch(this.error);
    }
}

module.exports = Device;
