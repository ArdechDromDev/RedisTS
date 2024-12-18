import {StartedTestContainer, TestContainer} from "testcontainers";
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import * as net from "node:net";
import {RedisContainer} from "@testcontainers/redis";
import PromiseSocket from "promise-socket";

const customRedisServer = (port: number): net.Server => {
    let entries = new Map<string, string>();

    const server = net.createServer((client) => {
        client.setEncoding("ascii")
        client.on("data", (args) => {
            const sendResponseWithSize = (data: string) => {
                const unquotedCommand = data.replace(/\"/g, '')
                client.write("$" + unquotedCommand.length + "\r\n" + unquotedCommand + "\r\n")
            }

            const command = args.toString().trimEnd();
            const [verb, ...params] = command.split(' ')

            console.log(args);
            if (verb == "PING") {
                client.write("+PONG\r\n")
            } else if (verb == "ECHO") {
                sendResponseWithSize(params.join())
            } else if (verb == "GET") {
                const entry = entries.get(params[0])

                if (!entry)
                    client.write("$-1\r\n")
                else sendResponseWithSize(entry)
            } else if (verb == "SET") {
                entries.set(params[0], params[1].trimEnd())
                client.write("+OK\r\n")
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

async function openSocket(port: number) {
    const socket = new net.Socket();
    socket.setEncoding("ascii")
    const promiseSocket = new PromiseSocket(socket)
    await promiseSocket.connect({port: port, host: "localhost"})
    return promiseSocket;
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
                const promiseSocket = await openSocket(port);

                await promiseSocket.write("PING\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("+PONG\r\n")
            })
            test('ping twice to container', async () => {
                const promiseSocket = await openSocket(port);

                await promiseSocket.write("PING\r\n")
                const ignoredPong = await promiseSocket.read()
                await promiseSocket.write("PING\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("+PONG\r\n")
            })
            test('ping concurrently to container', async () => {

                const promiseSocket1 = await openSocket(port);
                const promiseSocket2 = await openSocket(port);

                const promisePing1 = promiseSocket1.write("PING\r\n")
                const promisePing2 = promiseSocket2.write("PING\r\n")
                await Promise.all([promisePing1, promisePing2])

                const response =
                    await Promise.all([promiseSocket1, promiseSocket2].map(x => x.read()))

                expect(response).toStrictEqual(["+PONG\r\n", "+PONG\r\n"])
            })
            test('echo command', async () => {
                const promiseSocket = await openSocket(port);
                await promiseSocket.write("ECHO \"tototo\"\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("$6\r\ntototo\r\n")
            })
            test('echo command without quote', async () => {
                const promiseSocket = await openSocket(port);
                await promiseSocket.write("ECHO tototo\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("$6\r\ntototo\r\n")
            })
            test('GET command return nil', async () => {
                const promiseSocket = await openSocket(port);
                await promiseSocket.write("GET toto\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("$-1\r\n")
            })
            test('SET command return OK', async () => {
                const promiseSocket = await openSocket(port);
                await promiseSocket.write("SET mykey \"Hello\"\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("+OK\r\n")
            })
            test('SET then GET should return stored key', async () => {
                const promiseSocket = await openSocket(port);
                await promiseSocket.write("SET mykey \"Hello\"\r\n")
                await promiseSocket.read()
                await promiseSocket.write("GET mykey \r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("$5\r\nHello\r\n")
            })
            test('SET then GET should return stored key 2', async () => {
                const promiseSocket = await openSocket(port);
                await promiseSocket.write("SET mykey \"Hello2\"\r\n")
                await promiseSocket.read()
                await promiseSocket.write("GET mykey \r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("$6\r\nHello2\r\n")
            })
            test('SET then GET with multiple values', async () => {
                const promiseSocket = await openSocket(port);

                await promiseSocket.write("SET mykey1 \"Hello1\"\r\n")
                await promiseSocket.read()
                await promiseSocket.write("SET mykey2 \"Hello2\"\r\n")
                await promiseSocket.read()

                await promiseSocket.write("GET mykey1\r\n")
                const response1 = await promiseSocket.read()
                expect(response1).toBe("$6\r\nHello1\r\n")

                await promiseSocket.write("GET mykey2\r\n")
                const response2 = await promiseSocket.read()
                expect(response2).toBe("$6\r\nHello2\r\n")
            })
            test('prout to container', async () => {
                const promiseSocket = await openSocket(port);
                await promiseSocket.write("PROUT\r\n")
                const response = await promiseSocket.read()
                expect(response).toBe("-ERR unknown command 'PROUT', with args beginning with: \r\n")
            })
        })
    }
;

testImplementation('ADD redis impl', new AddRedisTestFactory());
testImplementation('reference redis impl', new RedisTestFactory());
