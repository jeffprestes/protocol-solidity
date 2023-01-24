export type EndPointConfig = {
  httpEndpoint: string;
  wsEndpoint: string;
  name: string;
};

export const polygonEndPoints: EndPointConfig = {
  httpEndpoint: process.env.POLYGON_KEY!,
  wsEndpoint: process.env.POLYGON_KEY_WS!,
  name: 'mumbai',
};

export const sepoliaEndPoints: EndPointConfig = {
  httpEndpoint: process.env.SEPOLIA_KEY!,
  wsEndpoint: process.env.SEPOLIA_KEY_WS!,
  name: 'sepolia',
};

export const localEndPoints: EndPointConfig = {
  httpEndpoint: process.env.LOCAL_KEY!,
  wsEndpoint: process.env.LOCAL_KEY_WS!,
  name: 'optimism',
};

export const goerliEndPoints: EndPointConfig = {
  httpEndpoint: process.env.GOERLI_KEY!,
  wsEndpoint: process.env.GOERLI_KEY_WS!,
  name: 'goerli',
};
