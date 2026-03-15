export interface OpcuaNodeConfig {
  nodeId: string;
  dataType: string;
  label: string;
}

export interface OpcuaMappingConfig {
  [key: string]: OpcuaNodeConfig;
}

const opcuaMapping: OpcuaMappingConfig = {
  AirConsumption: {
    nodeId: "ns=1;s=AirConsumption",
    dataType: "Double",
    label: "Air Consumption",
  },
  PowerConsumption: {
    nodeId: "ns=1;s=PowerConsumption",
    dataType: "Double",
    label: "Power Consumption",
  },
  OperationMode: {
    nodeId: "ns=1;s=OperationMode",
    dataType: "Int32",
    label: "Operation Mode",
  },
};

export default opcuaMapping;
