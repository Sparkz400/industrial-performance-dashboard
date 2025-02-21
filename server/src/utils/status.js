let status = {
    database: "not connected",
    opcua: "not connected"
};

function setDatabaseStatus(newStatus) {
    status.database = newStatus;
}

function setOpcuaStatus(newStatus) {
    status.opcua = newStatus;
}

function getStatus() {
    return status;
}

module.exports = {
    setDatabaseStatus,
    setOpcuaStatus,
    getStatus,
};
