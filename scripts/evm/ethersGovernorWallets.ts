require('dotenv').config();
import { getChainIdType } from '@webb-tools/utils';
import { ethers } from 'ethers';

export const providerPolygon = new ethers.providers.JsonRpcProvider(process.env.POLYGON_KEY!);
export const walletPolygon = new ethers.Wallet(process.env.PRIVATE_KEY!, providerPolygon);
export const chainIdTypePolygon = getChainIdType(80001);

export const providerGoerli = new ethers.providers.JsonRpcProvider(process.env.GOERLI_KEY!);
export const walletGoerli = new ethers.Wallet(process.env.PRIVATE_KEY!, providerGoerli);
export const chainIdTypeGoerli = getChainIdType(5);

export const providerSepolia = new ethers.providers.JsonRpcProvider(`https://rpc.sepolia.org`);
export const walletSepolia = new ethers.Wallet(process.env.PRIVATE_KEY!, providerSepolia);
export const chainIdTypeSepolia = getChainIdType(11155111);

export const providerAvalanche = new ethers.providers.JsonRpcProvider(process.env.AVALANCHE_KEY!);
export const walletAvalanche = new ethers.Wallet(process.env.PRIVATE_KEY!, providerAvalanche);
export const chainIdTypeAvalanche = getChainIdType(43113);

export const providerAurora = new ethers.providers.JsonRpcProvider(process.env.AURORA_KEY!);
export const walletAurora = new ethers.Wallet(process.env.PRIVATE_KEY!, providerAurora);
export const chainIdTypeAurora = getChainIdType(1313161555);

export const providerLocal = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:8545`);
export const walletLocal = new ethers.Wallet(process.env.PRIVATE_KEY!, providerLocal);
export const chainIdTypeLocal = getChainIdType(1337);

