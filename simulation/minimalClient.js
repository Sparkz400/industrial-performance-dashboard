const opcua = require("node-opcua");

const client = opcua.OPCUAClient.create({
    endpointMustExist: false,
    securityMode: opcua.MessageSecurityMode.None,
    securityPolicy: opcua.SecurityPolicy.None,
});

const endpointUrl = "opc.tcp://localhost:4840/UA/MyLittleServer"; // Adjust if needed

async function testConnection() {
    try {
        await client.connect(endpointUrl);
        console.log("Connected to the OPC UA server.");
        const session = await client.createSession();
        console.log("Session created successfully.");
        await session.close();
        await client.disconnect();
        console.log("Disconnected successfully.");
    } catch (err) {
        console.error("Error in minimal client:", err);
    }
}

testConnection();
