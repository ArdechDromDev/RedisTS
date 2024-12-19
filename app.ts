import net from "node:net";

export const customRedisServer = (port: number): net.Server => {
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
            switch (verb) {
                case "PING":
                    client.write("+PONG\r\n")
                    break
                case "ECHO":
                    sendResponseWithSize(params.join())
                    break
                case "GET":
                    const entry = entries.get(params[0])

                    if (!entry)
                        client.write("$-1\r\n")
                    else sendResponseWithSize(entry)
                    break
                case "SET":
                    entries.set(params[0], params[1].trimEnd())
                    client.write("+OK\r\n")
                    break
                default:
                    client.write(`-ERR unknown command '${verb}', with args beginning with: \r\n`)
            }
        })
    })
    server.listen(port)
    return server;
}

customRedisServer(1234)