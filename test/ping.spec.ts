import {
    TestContainer,
    StoppedTestContainer
} from "testcontainers";


import { expect, test, beforeEach, describe } from 'vitest'
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

describe('redis tests', () => {
    let port: number;

    beforeEach(async () => {
        // called once before all tests run
        const container: TestContainer = new RedisContainer();
        const startedContainer = await container.start();
        port = startedContainer.getFirstMappedPort()

        // clean up function, called once after all tests run
        return async () => {
            const stoppedContainer: StoppedTestContainer = await startedContainer.stop();
        }
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

    test('prout to container', async () => {
        const socket = new net.Socket();
        socket.setEncoding("ascii")
        const promiseSocket = new PromiseSocket(socket)
        await promiseSocket.connect({port: port, host: "localhost"})

        await promiseSocket.write("PROUT\r\n")
        const response = await promiseSocket.read()
        expect(response).toBe("-ERR unknown command 'PROUT', with args beginning with: \r\n")
    }, 1000000)
});

describe('redis-add', () => {
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