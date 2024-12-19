import {TestContainer} from "testcontainers";
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import * as net from "node:net";
import {RedisContainer} from "@testcontainers/redis";
import PromiseSocket from "promise-socket";
import {customRedisServer} from "../app";

interface Stoppable {
    stop(): Promise<void>
}

class Target {
    readonly port: number;
    private readonly stoppable: Stoppable;

    constructor(port: number, stoppable: Stoppable) {
        this.port = port;
        this.stoppable = stoppable;
    }

    stop(): Promise<void> {
        return this.stoppable.stop()
    }
}

interface TestTargetFactory {
    create(): Promise<Target>;
}

class AddRedisFactory implements TestTargetFactory {

    async create(): Promise<Target> {
        const port = 12346;
        const server = customRedisServer(port);
        return new Target(port, new class implements Stoppable {
            async stop(): Promise<void> {
                server.close();
            }
        });
    }

}

class RedisContainerFactory implements TestTargetFactory {

    async create(): Promise<Target> {
        const container: TestContainer = new RedisContainer();
        const startedContainer = await container.start();

        return new Target(startedContainer.getFirstMappedPort(), new class implements Stoppable {
            async stop(): Promise<void> {
                await startedContainer.stop();
            }
        });
    }
}

async function openSocket(target: Target) {
    const socket = new net.Socket();
    socket.setEncoding("ascii")
    const promiseSocket = new PromiseSocket(socket)
    await promiseSocket.connect({port: target.port, host: "localhost"})
    return promiseSocket;
}

const testImplementation = (name: String, targetFactory: TestTargetFactory) => {
        describe('redis tests ' + name, () => {
            let target: Target;
            beforeEach(async () => {
                target = await targetFactory.create()
            })

            afterEach(async () => {
                await target.stop()
            })

            test('ping to container', async () => {
                const socket = await openSocket(target);

                await socket.write("PING\r\n")
                const response = await socket.read()
                expect(response).toBe("+PONG\r\n")
            })
            test('ping twice to container', async () => {
                const socket = await openSocket(target);

                await socket.write("PING\r\n")
                const ignoredPong = await socket.read()
                await socket.write("PING\r\n")
                const response = await socket.read()
                expect(response).toBe("+PONG\r\n")
            })
            test('ping concurrently to container', async () => {

                const socket1 = await openSocket(target);
                const socket2 = await openSocket(target);

                const promisePing1 = socket1.write("PING\r\n")
                const promisePing2 = socket2.write("PING\r\n")
                await Promise.all([promisePing1, promisePing2])

                const response =
                    await Promise.all([socket1, socket2].map(x => x.read()))

                expect(response).toStrictEqual(["+PONG\r\n", "+PONG\r\n"])
            })
            test('echo command', async () => {
                const socket = await openSocket(target);
                await socket.write("ECHO \"tototo\"\r\n")
                const response = await socket.read()
                expect(response).toBe("$6\r\ntototo\r\n")
            })
            test('echo command without quote', async () => {
                const socket = await openSocket(target);
                await socket.write("ECHO tototo\r\n")
                const response = await socket.read()
                expect(response).toBe("$6\r\ntototo\r\n")
            })
            test('GET command return nil', async () => {
                const socket = await openSocket(target);
                await socket.write("GET toto\r\n")
                const response = await socket.read()
                expect(response).toBe("$-1\r\n")
            })
            test('SET command return OK', async () => {
                const socket = await openSocket(target);
                await socket.write("SET mykey \"Hello\"\r\n")
                const response = await socket.read()
                expect(response).toBe("+OK\r\n")
            })
            test('SET then GET should return stored key', async () => {
                const socket = await openSocket(target);
                await socket.write("SET mykey \"Hello\"\r\n")
                await socket.read()
                await socket.write("GET mykey \r\n")
                const response = await socket.read()
                expect(response).toBe("$5\r\nHello\r\n")
            })
            test('SET then GET should return stored key 2', async () => {
                const socket = await openSocket(target);
                await socket.write("SET mykey \"Hello2\"\r\n")
                await socket.read()
                await socket.write("GET mykey \r\n")
                const response = await socket.read()
                expect(response).toBe("$6\r\nHello2\r\n")
            })
            test('SET then GET with multiple values', async () => {
                const socket = await openSocket(target);

                await socket.write("SET mykey1 \"Hello1\"\r\n")
                await socket.read()
                await socket.write("SET mykey2 \"Hello2\"\r\n")
                await socket.read()

                await socket.write("GET mykey1\r\n")
                const response1 = await socket.read()
                expect(response1).toBe("$6\r\nHello1\r\n")

                await socket.write("GET mykey2\r\n")
                const response2 = await socket.read()
                expect(response2).toBe("$6\r\nHello2\r\n")
            })
            test('prout to container', async () => {
                const socket = await openSocket(target);
                await socket.write("PROUT\r\n")
                const response = await socket.read()
                expect(response).toBe("-ERR unknown command 'PROUT', with args beginning with: \r\n")
            })
        })
    }
;

testImplementation('ADD redis impl', new AddRedisFactory());
testImplementation('reference redis impl', new RedisContainerFactory());
