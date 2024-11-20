import {StartedTestContainer, TestContainer} from "testcontainers";
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import * as net from "node:net";
import {RedisContainer} from "@testcontainers/redis";
import PromiseSocket from "promise-socket";

const customRedisServer = (port: number): net.Server => {
    const server = net.createServer((client) => {
        client.setEncoding("ascii")
        client.on("data", (args) => {
            console.log(args);
            if (args == "PING\r\n") {
                client.write("+PONG\r\n")
            } else {
                client.write("-ERR unknown command 'PROUT', with args beginning with: \r\n")
            }
        })
    })
    server.listen(port)
    return server;
}

interface TestFactory {
    beforeEach(): Promise<number>;

    afterEach(): Promise<void>;
}

class AddRedisTestFactory implements TestFactory {
    private port: number;
    private server: net.Server;

    async beforeEach(): Promise<number> {
        this.port = 12346;
        this.server = customRedisServer(this.port);
        return this.port
    }

    async afterEach(): Promise<void> {
        this.server.close()
    }
}

class RedisTestFactory implements TestFactory {
    private startedContainer: StartedTestContainer | undefined

    async beforeEach() {
        const container: TestContainer = new RedisContainer();
        this.startedContainer = await container.start();
        return this.startedContainer.getFirstMappedPort()
    }

    async afterEach() {
        if (this.startedContainer) {
            await this.startedContainer.stop();
        }
    }
}

const testImplementation = (name: String, testFactory: TestFactory) => {
        describe('redis tests ' + name, () => {
            let port: number;
            beforeEach(async () => {
                port = await testFactory.beforeEach()
            })

            afterEach(async () => {
                await testFactory.afterEach()
            })

            test('ping to container', async () => {
                const socket = new net.Socket();
                socket.setEncoding("ascii")

                const promiseSocket = new PromiseSocket(socket)
                await promiseSocket.connect({port: port, host: "localhost"})

                await promiseSocket.write("PING\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("+PONG\r\n")
            }, 10000)

            test('prout to container', async () => {
                const socket = new net.Socket();
                socket.setEncoding("ascii")
                const promiseSocket = new PromiseSocket(socket)
                await promiseSocket.connect({port: port, host: "localhost"})

                await promiseSocket.write("PROUT\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("-ERR unknown command 'PROUT', with args beginning with: \r\n")
            }, 10000)
        })
    }
;

testImplementation('reference redis impl', new RedisTestFactory());
testImplementation('ADD redis impl', new AddRedisTestFactory());