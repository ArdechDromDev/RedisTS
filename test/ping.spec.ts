import {StartedTestContainer, StoppedTestContainer, TestContainer} from "testcontainers";


import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import * as net from "node:net";
import {RedisContainer} from "@testcontainers/redis";
import PromiseSocket from "promise-socket";

const customRedisServer = (port: number): net.Server => {
    const server = net.createServer((socket) => {
        socket.write("+PONG\r\n")
    })
    server.listen(port)
    return server;
}

interface TestFactory {
    beforeEach(): Promise<number>;

    afterEach(): Promise<void>;
}

class RedisTestFactory implements TestFactory {
    private startedContainer : StartedTestContainer | undefined

    async beforeEach() {
        // called once before all tests run
        const container: TestContainer = new RedisContainer();
        this.startedContainer = await container.start();
        return this.startedContainer.getFirstMappedPort()
    }

    async afterEach() {
        if (this.startedContainer) {
            const stoppedContainer: StoppedTestContainer = await this.startedContainer.stop();
        }
    }
}

const testImplementation = (testFactory: TestFactory) => {
    describe('redis tests', () => {
        let port: number;
        beforeEach(async () => {
            // called once before all tests run
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
        }, 1000000)

        test.skip('prout to container', async () => {
            const socket = new net.Socket();
            socket.setEncoding("ascii")
            const promiseSocket = new PromiseSocket(socket)
            await promiseSocket.connect({port: port, host: "localhost"})

            await promiseSocket.write("PROUT\r\n")
            const response = await promiseSocket.read()
            expect(response).toBe("-ERR unknown command 'PROUT', with args beginning with: \r\n")
        }, 1000000)
    })
}
;

describe.skip('redis-add', () => {
    const port: number = 12345
    beforeEach(async () => {
        const server = customRedisServer(port)
    })

    test('ping to custom implementation', async () => {
        const socket = new net.Socket();

        socket.setEncoding("ascii")
        const promiseSocket = new PromiseSocket(socket)
        await promiseSocket.connect({port: port, host: "localhost"})
        await promiseSocket.write("PING\r\n")

        const response = await promiseSocket.read()
        expect(response).toBe("+PONG\r\n")
    }, 1000000)
})

testImplementation(new RedisTestFactory());

class AddRedisTestFactory implements TestFactory {
    private port: number;
    private server: net.Server;

    async beforeEach(): Promise<number> {
        this.port = 12345;
        this.server = customRedisServer(this.port);
        return this.port
    }
    async afterEach(): Promise<void> {
        this.server.close()
    }
}

testImplementation(new AddRedisTestFactory());