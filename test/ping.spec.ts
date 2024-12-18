import {StartedTestContainer, TestContainer} from "testcontainers";
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import * as net from "node:net";
import {RedisContainer} from "@testcontainers/redis";
import PromiseSocket from "promise-socket";

const customRedisServer = (port: number): net.Server => {
    const server = net.createServer((client) => {
        client.setEncoding("ascii")
        client.on("data", (args) => {
            const command = args.toString();

            console.log(args);
            if (command == "PING\r\n") {
                client.write("+PONG\r\n")
            } else if (command.startsWith("ECHO")) {
                const remaining = command.slice("ECHO \"".length, command.length - 3)
                const length = remaining.length
                client.write("$" + length + "\r\n" + remaining + "\r\n")
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
            test('ping twice to container', async () => {
                const socket = new net.Socket();
                socket.setEncoding("ascii")

                const promiseSocket = new PromiseSocket(socket)
                await promiseSocket.connect({port: port, host: "localhost"})

                await promiseSocket.write("PING\r\n")
                const ignoredPong = await promiseSocket.read()
                await promiseSocket.write("PING\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("+PONG\r\n")
            }, 10000)
            test('ping concurrently to container', async () => {
                async function openSocket() {
                    const socket = new net.Socket();
                    socket.setEncoding("ascii")
                    const promiseSocket = new PromiseSocket(socket)
                    await promiseSocket.connect({port: port, host: "localhost"})
                    return promiseSocket;
                }

                const promiseSocket1 = await openSocket();
                const promiseSocket2 = await openSocket();

                const promisePing1 = promiseSocket1.write("PING\r\n")
                const promisePing2 = promiseSocket2.write("PING\r\n")
                await Promise.all([promisePing1, promisePing2])

                const response =
                    await Promise.all([promiseSocket1, promiseSocket2].map(x => x.read()))

                expect(response).toStrictEqual(["+PONG\r\n", "+PONG\r\n"])
            }, 10000)
            test('echo command', async () => {
                const socket = new net.Socket();
                socket.setEncoding("ascii")
                const promiseSocket = new PromiseSocket(socket)
                await promiseSocket.connect({port: port, host: "localhost"})

                await promiseSocket.write("ECHO \"tototo\"\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("$6\r\ntototo\r\n")
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