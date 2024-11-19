import {
    TestContainer,
    StartedTestContainer,
    StoppedTestContainer,
    GenericContainer
} from "testcontainers";


import { expect, test } from 'vitest'
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

test('ping to container', async () => {
    const container: TestContainer = new RedisContainer();
    const startedContainer: StartedTestContainer = await container.start();

    const port = startedContainer.getFirstMappedPort()

    const socket = new net.Socket();

    socket.setEncoding("ascii")

    const promiseSocket = new PromiseSocket(socket)

    await promiseSocket.connect({port: port, host : "localhost"})


    await promiseSocket.write("PING\r\n")

    const response = await promiseSocket.read()

    expect(response).toBe("+PONG\r\n")
    const stoppedContainer: StoppedTestContainer = await startedContainer.stop();
}, 1000000)

test('prout to container', async () => {
    const container: TestContainer = new RedisContainer();
    const startedContainer: StartedTestContainer = await container.start();

    const port = startedContainer.getFirstMappedPort()

    const socket = new net.Socket();

    socket.setEncoding("ascii")

    const promiseSocket = new PromiseSocket(socket)

    await promiseSocket.connect({port: port, host : "localhost"})


    await promiseSocket.write("PROUT\r\n")

    const response = await promiseSocket.read()

    expect(response).toBe("-ERR unknown command 'PROUT', with args beginning with: \r\n")
    const stoppedContainer: StoppedTestContainer = await startedContainer.stop();
}, 1000000)

test('ping to custom implementation', async () => {
    const customServerPort = 12345
    const server = customRedisServer(customServerPort)

    const socket = new net.Socket();
    socket.setEncoding("ascii")
    const promiseSocket = new PromiseSocket(socket)
    await promiseSocket.connect({port: customServerPort, host : "localhost"})
    await promiseSocket.write("PING\r\n")

    const response = await promiseSocket.read()

    expect(response).toBe("+PONG\r\n")
}, 1000000)