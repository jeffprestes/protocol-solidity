import { BigNumber, BigNumberish, ContractTransaction, ethers } from 'ethers';
const assert = require('assert');
import {
  IdentityVAnchor as IdentityVAnchorContract,
  IdentityVAnchor__factory,
  IdentityVAnchorEncodeInputs__factory,
  TokenWrapper,
  TokenWrapper__factory,
} from '@webb-tools/contracts';
import {
  toHex,
  Keypair,
  toFixedHex,
  Utxo,
  MerkleTree,
  median,
  mean,
  max,
  min,
  randomBN,
  CircomProvingManager,
  generateVariableWitnessInput,
  getVAnchorExtDataHash,
  MerkleProof,
  UtxoGenInput,
  CircomUtxo,
} from '@webb-tools/sdk-core';
import {
  IAnchorDeposit,
  IAnchor,
  IIdentityVariableAnchorExtData,
  IIdentityVariableAnchorPublicInputs,
  IAnchorDepositInfo,
} from '@webb-tools/interfaces';
import {
  hexToU8a,
  u8aToHex,
  getChainIdType,
  UTXOInputs,
  ZkComponents,
  ZERO_BYTES32,
} from '@webb-tools/utils';
import { Semaphore } from '@webb-tools/semaphore';
import { LinkedGroup } from '@webb-tools/semaphore-group';
import { VAnchorBase } from './VAnchorBase';

const snarkjs = require('snarkjs');

const zeroAddress = '0x0000000000000000000000000000000000000000';

export type FullProof = {
  proof: Proof;
  publicSignals: RawPublicSignals;
};

export type Proof = {
  pi_a: string[3];
  pi_b: Array<string[2]>;
  pi_c: string[3];
  protocol: string;
  curve: string;
};
export type ExtData = {
  recipient: string;
  extAmount: string;
  relayer: string;
  fee: string;
  refund: string;
  token: string;
  encryptedOutput1: string;
  encryptedOutput2: string;
};

export type RawPublicSignals = string[11];

function checkNativeAddress(tokenAddress: string): boolean {
  if (tokenAddress === zeroAddress || tokenAddress === '0') {
    return true;
  }
  return false;
}
export var gasBenchmark = [];
export var proofTimeBenchmark = [];
// This convenience wrapper class is used in tests -
// It represents a deployed contract throughout its life (e.g. maintains merkle tree state)
// Functionality relevant to anchors in general (proving, verifying) is implemented in static methods
// Functionality relevant to a particular anchor deployment (deposit, withdraw) is implemented in instance methods
export class IdentityVAnchor extends VAnchorBase implements IAnchor {
  signer: ethers.Signer;
  contract: IdentityVAnchorContract;
  semaphore: Semaphore;
  tree: MerkleTree;
  group: LinkedGroup;
  // hex string of the connected root
  latestSyncedBlock: number;
  smallCircuitZkComponents: ZkComponents;
  largeCircuitZkComponents: ZkComponents;

  // The depositHistory stores leafIndex => information to create proposals (new root)
  depositHistory: Record<number, string>;
  token?: string;
  denomination?: string;
  maxEdges: number;
  groupId: BigNumber;
  provingManager: CircomProvingManager;

  constructor(
    contract: IdentityVAnchorContract,
    signer: ethers.Signer,
    treeHeight: number,
    maxEdges: number,
    groupId: BigNumber,
    group: LinkedGroup,
    smallCircuitZkComponents: ZkComponents,
    largeCircuitZkComponents: ZkComponents
  ) {
    super()
    this.signer = signer;
    this.contract = contract;
    this.tree = new MerkleTree(treeHeight);
    this.latestSyncedBlock = 0;
    this.maxEdges = maxEdges;
    this.groupId = groupId;
    this.group = group;
    this.depositHistory = {};
    this.smallCircuitZkComponents = smallCircuitZkComponents;
    this.largeCircuitZkComponents = largeCircuitZkComponents;
  }
  deposit(destinationChainId: number): Promise<IAnchorDeposit> {
    throw new Error('Method not implemented.');
  }
  setupWithdraw(
    deposit: IAnchorDepositInfo,
    index: number,
    recipient: string,
    relayer: string,
    fee: bigint,
    refreshCommitment: string | number
  ) {
    throw new Error('Method not implemented.');
  }
  withdraw(
    deposit: IAnchorDepositInfo,
    index: number,
    recipient: string,
    relayer: string,
    fee: bigint,
    refreshCommitment: string | number
  ): Promise<ethers.Event> {
    throw new Error('Method not implemented.');
  }
  wrapAndDeposit(
    tokenAddress: string,
    wrappingFee: number,
    destinationChainId?: number
  ): Promise<IAnchorDeposit> {
    throw new Error('Method not implemented.');
  }
  bridgedWithdrawAndUnwrap(
    deposit: IAnchorDeposit,
    merkleProof: any,
    recipient: string,
    relayer: string,
    fee: string,
    refund: string,
    refreshCommitment: string,
    tokenAddress: string
  ): Promise<ethers.Event> {
    throw new Error('Method not implemented.');
  }
  bridgedWithdraw(
    deposit: IAnchorDeposit,
    merkleProof: any,
    recipient: string,
    relayer: string,
    fee: string,
    refund: string,
    refreshCommitment: string
  ): Promise<ethers.Event> {
    throw new Error('Method not implemented.');
  }
  getAddress(): string {
    return this.contract.address;
  }

  public static async createIdentityVAnchor(
    semaphore: Semaphore,
    verifier: string,
    levels: BigNumberish,
    hasher: string,
    handler: string,
    token: string,
    maxEdges: number,
    groupId: BigNumber,
    group: LinkedGroup,
    smallCircuitZkComponents: ZkComponents,
    largeCircuitZkComponents: ZkComponents,
    signer: ethers.Signer
  ) {
    const encodeLibraryFactory = new IdentityVAnchorEncodeInputs__factory(signer);
    const encodeLibrary = await encodeLibraryFactory.deploy();
    await encodeLibrary.deployed();
    const factory = new IdentityVAnchor__factory(
      {
        ['contracts/libs/IdentityVAnchorEncodeInputs.sol:IdentityVAnchorEncodeInputs']:
          encodeLibrary.address,
      },
      signer
    );
    const vAnchor = await factory.deploy(
      semaphore.contract.address,
      verifier,
      levels,
      hasher,
      handler,
      token,
      maxEdges,
      groupId
    );
    await vAnchor.deployed();
    const createdIdentityVAnchor = new IdentityVAnchor(
      vAnchor,
      signer,
      BigNumber.from(levels).toNumber(),
      maxEdges,
      groupId,
      group,
      smallCircuitZkComponents,
      largeCircuitZkComponents
    );
    createdIdentityVAnchor.latestSyncedBlock = vAnchor.deployTransaction.blockNumber!;
    createdIdentityVAnchor.token = token;
    return createdIdentityVAnchor;
  }

  public static async connect(
    // connect via factory method
    // build up tree by querying provider for logs
    address: string,
    group: LinkedGroup,
    smallCircuitZkComponents: ZkComponents,
    largeCircuitZkComponents: ZkComponents,
    signer: ethers.Signer
  ) {
    const anchor = IdentityVAnchor__factory.connect(address, signer);
    const maxEdges = await anchor.maxEdges();
    const treeHeight = await anchor.levels();
    const groupId = await anchor.groupId();
    const createdAnchor = new IdentityVAnchor(
      anchor,
      signer,
      treeHeight,
      maxEdges,
      groupId,
      group,
      smallCircuitZkComponents,
      largeCircuitZkComponents
    );
    createdAnchor.token = await anchor.token();
    return createdAnchor;
  }

  public static async generateUTXO(input: UtxoGenInput): Promise<Utxo> {
    return CircomUtxo.generateUtxo(input);
  }
  public async generateProofCalldata(fullProof: any) {
    // const result = snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const calldata = await snarkjs.groth16.exportSolidityCallData(
      fullProof.proof,
      fullProof.publicSignals
    );
    const proof = JSON.parse('[' + calldata + ']');
    const pi_a = proof[0];
    const pi_b = proof[1];
    const pi_c = proof[2];

    const proofEncoded = [
      pi_a[0],
      pi_a[1],
      pi_b[0][0],
      pi_b[0][1],
      pi_b[1][0],
      pi_b[1][1],
      pi_c[0],
      pi_c[1],
    ]
      .map((elt) => elt.substr(2))
      .join('');

    return proofEncoded;
  }
  //
  // public static createRootsBytes(rootArray: string[]) {
  //   let rootsBytes = '0x';
  //   for (let i = 0; i < rootArray.length; i++) {
  //     rootsBytes += toFixedHex(rootArray[i]).substr(2);
  //   }
  //   return rootsBytes; // root byte string (32 * array.length bytes)
  // }
  //
  // // Convert a hex string to a byte array
  // public static hexStringToByte(str: string) {
  //   if (!str) {
  //     return new Uint8Array();
  //   }
  //
  //   var a = [];
  //   for (var i = 0, len = str.length; i < len; i += 2) {
  //     a.push(parseInt(str.substr(i, 2), 16));
  //   }
  //
  //   return new Uint8Array(a);
  // }

  public static convertToPublicInputsStruct(args: any[]): IIdentityVariableAnchorPublicInputs {
    return {
      proof: args[0],
      identityRoots: args[1],
      vanchorRoots: args[2],
      inputNullifiers: args[3],
      outputCommitments: args[4],
      publicAmount: args[5],
      extDataHash: args[6],
    };
  }

  public static convertToExtDataStruct(args: any[]): IIdentityVariableAnchorExtData {
    return {
      recipient: args[0],
      extAmount: args[1],
      relayer: args[2],
      fee: args[3],
      refund: args[4],
      token: args[5],
      encryptedOutput1: args[6],
      encryptedOutput2: args[7],
    };
  }

  // Sync the local tree with the tree on chain.
  // Start syncing from the given block number, otherwise zero.
  public async update(blockNumber?: number) {
    // const filter = this.contract.filters.Deposit();
    // const currentBlockNumber = await this.signer.provider!.getBlockNumber();
    // const events = await this.contract.queryFilter(filter, blockNumber || 0);
    // const commitments = events.map((event) => event.args.commitment);
    // this.tree.batch_insert(commitments);
    // this.latestSyncedBlock = currentBlockNumber;
  }

  public async createResourceId(): Promise<string> {
    return toHex(
      this.contract.address + toHex(getChainIdType(await this.signer.getChainId()), 6).substr(2),
      32
    );
  }

  public async setVerifier(verifierAddress: string) {
    const tx = await this.contract.setVerifier(
      verifierAddress,
      BigNumber.from(await this.contract.getProposalNonce()).add(1)
    );
    await tx.wait();
  }

  public async setHandler(handlerAddress: string) {
    const tx = await this.contract.setHandler(
      handlerAddress,
      BigNumber.from(await this.contract.getProposalNonce()).add(1)
    );
    await tx.wait();
  }

  public async setSigner(newSigner: ethers.Signer) {
    const currentChainId = await this.signer.getChainId();
    const newChainId = await newSigner.getChainId();

    if (currentChainId === newChainId) {
      this.signer = newSigner;
      this.contract = this.contract.connect(newSigner);
      return true;
    }
    return false;
  }

  // Proposal data is used to update linkedAnchors via bridge proposals
  // on other chains with this anchor's state
  public async getProposalData(resourceID: string, leafIndex?: number): Promise<string> {
    // If no leaf index passed in, set it to the most recent one.
    if (!leafIndex) {
      leafIndex = this.tree.number_of_elements() - 1;
    }

    const chainID = getChainIdType(await this.signer.getChainId());
    const merkleRoot = this.depositHistory[leafIndex];
    const functionSig = ethers.utils
      .keccak256(ethers.utils.toUtf8Bytes('updateEdge(bytes32,uint32,bytes32)'))
      .slice(0, 10)
      .padEnd(10, '0');

    const srcContract = this.contract.address;
    const srcResourceId =
      '0x' +
      toHex(0, 6).substring(2) +
      toHex(srcContract, 20).substr(2) +
      toHex(chainID, 6).substr(2);
    return (
      '0x' +
      toHex(resourceID, 32).substr(2) +
      functionSig.slice(2) +
      toHex(leafIndex, 4).substr(2) +
      toHex(merkleRoot, 32).substr(2) +
      toHex(srcResourceId, 32).substr(2)
    );
  }

  public async getHandler(): Promise<string> {
    return this.contract.handler();
  }

  public async getHandlerProposalData(newHandler: string): Promise<string> {
    const resourceID = await this.createResourceId();
    const functionSig = ethers.utils
      .keccak256(ethers.utils.toUtf8Bytes('setHandler(address,uint32)'))
      .slice(0, 10)
      .padEnd(10, '0');
    const nonce = Number(await this.contract.getProposalNonce()) + 1;

    return (
      '0x' +
      toHex(resourceID, 32).substr(2) +
      functionSig.slice(2) +
      toHex(nonce, 4).substr(2) +
      toHex(newHandler, 20).substr(2)
    );
  }

  public async getMinWithdrawalLimitProposalData(
    _minimalWithdrawalAmount: string
  ): Promise<string> {
    const resourceID = await this.createResourceId();
    const functionSig = ethers.utils
      .keccak256(ethers.utils.toUtf8Bytes('configureMinimalWithdrawalLimit(uint256,uint32)'))
      .slice(0, 10)
      .padEnd(10, '0');
    const nonce = Number(await this.contract.getProposalNonce()) + 1;
    return (
      '0x' +
      toHex(resourceID, 32).substr(2) +
      functionSig.slice(2) +
      toHex(nonce, 4).substr(2) +
      toFixedHex(_minimalWithdrawalAmount).substr(2)
    );
  }

  public async getMaxDepositLimitProposalData(_maximumDepositAmount: string): Promise<string> {
    const resourceID = await this.createResourceId();
    const functionSig = ethers.utils
      .keccak256(ethers.utils.toUtf8Bytes('configureMaximumDepositLimit(uint256,uint32)'))
      .slice(0, 10)
      .padEnd(10, '0');
    const nonce = Number(await this.contract.getProposalNonce()) + 1;
    return (
      '0x' +
      toHex(resourceID, 32).substr(2) +
      functionSig.slice(2) +
      toHex(nonce, 4).substr(2) +
      toFixedHex(_maximumDepositAmount).substr(2)
    );
  }

  public async populateVAnchorRootsForProof(): Promise<string[]> {
    const neighborEdges = await this.contract.getLatestNeighborEdges();
    const neighborRootInfos = neighborEdges.map((rootData) => {
      return rootData.root;
    });
    let thisRoot = await this.contract.getLastRoot();
    return [thisRoot, ...neighborRootInfos];
  }

  public async getClassAndContractRoots() {
    return [this.tree.root(), await this.contract.getLastRoot()];
  }

  /**
   *
   * @param input A UTXO object that is inside the tree
   * @returns
   */
  public getMerkleProof(input: Utxo): MerkleProof {
    let inputMerklePathIndices: number[];
    let inputMerklePathElements: BigNumber[];

    if (Number(input.amount) > 0) {
      if (input.index < 0) {
        throw new Error(`Input commitment ${u8aToHex(input.commitment)} was not found`);
      }
      const path = this.tree.path(input.index);
      inputMerklePathIndices = path.pathIndices;
      inputMerklePathElements = path.pathElements;
    } else {
      inputMerklePathIndices = new Array(this.tree.levels).fill(0);
      inputMerklePathElements = new Array(this.tree.levels).fill(0);
    }

    return {
      element: BigNumber.from(u8aToHex(input.commitment)),
      pathElements: inputMerklePathElements,
      pathIndices: inputMerklePathIndices,
      merkleRoot: this.tree.root(),
    };
  }

  public generatePublicInputs(
    proof: any,
    byte_calldata: any,
    nIns: number = 2,
    nOuts: number = 2,
    numSemaphoreRoots: number = 2,
    numVAnchorRoots: number = 2
  ): IIdentityVariableAnchorPublicInputs {
    // public inputs to the contract
    const publicInputs = JSON.parse('[' + byte_calldata + ']')[3];

    let index = 0;
    const identityRoots = publicInputs.slice(index, numSemaphoreRoots);
    index = numSemaphoreRoots + 1; // ignoring public chainID from circuit

    const publicAmount = publicInputs[index++];
    const extDataHash = publicInputs[index++];

    const inputs = publicInputs.slice(index, index + nIns);
    index += nIns;

    const outputs = publicInputs.slice(index, index + nOuts);
    index += nOuts;

    const vanchorRoots = publicInputs.slice(index, index + numVAnchorRoots);
    const args: IIdentityVariableAnchorPublicInputs = {
      proof: `0x${proof}`,
      identityRoots: `0x${identityRoots.map((x) => toFixedHex(x).slice(2)).join('')}`,
      vanchorRoots: `0x${vanchorRoots.map((x) => toFixedHex(x).slice(2)).join('')}`,
      inputNullifiers: inputs.map((x) => toFixedHex(x)),
      outputCommitments: [toFixedHex(outputs[0]), toFixedHex(outputs[1])],
      publicAmount: toFixedHex(publicAmount),
      extDataHash: toFixedHex(extDataHash),
    };

    return args;
  }

  /**
   * Given a list of leaves and a latest synced block, update internal tree state
   * The function will create a new tree, and check on chain root before updating its member variable
   * If the passed leaves match on chain data,
   *   update this instance and return true
   * else
   *   return false
   */
  public async setWithLeaves(leaves: string[], syncedBlock?: number): Promise<Boolean> {
    let newTree = new MerkleTree(this.tree.levels, leaves);
    let root = toFixedHex(newTree.root());
    let validTree = await this.contract.isKnownRoot(root);

    if (validTree) {
      let index = 0;
      for (const leaf of newTree.elements()) {
        this.depositHistory[index] = toFixedHex(this.tree.root());
        index++;
      }
      if (!syncedBlock) {
        syncedBlock = await this.signer.provider.getBlockNumber();
      }
      this.tree = newTree;
      this.latestSyncedBlock = syncedBlock;
      return true;
    } else {
      return false;
    }
  }

  public async getGasBenchmark() {
    const gasValues = gasBenchmark.map(Number);
    const meanGas = mean(gasValues);
    const medianGas = median(gasValues);
    const maxGas = max(gasValues);
    const minGas = min(gasValues);
    return {
      gasValues,
      meanGas,
      medianGas,
      maxGas,
      minGas,
    };
    // return gasBenchmark;
  }
  public async getProofTimeBenchmark() {
    const meanTime = mean(proofTimeBenchmark);
    const medianTime = median(proofTimeBenchmark);
    const maxTime = max(proofTimeBenchmark);
    const minTime = min(proofTimeBenchmark);
    return {
      proofTimeBenchmark,
      meanTime,
      medianTime,
      maxTime,
      minTime,
    };
  }
  public async generateProof(
    keypair: Keypair,
    identityRoots: string[],
    identityMerkleProof: MerkleProof,
    outSemaphoreProofs: MerkleProof[],
    extDataHash: string,
    vanchorInputs: UTXOInputs
  ): Promise<FullProof> {
    // ): Promise<{proof: > {
    const proofInputs = {
      privateKey: keypair.privkey.toString(),
      semaphoreTreePathIndices: identityMerkleProof.pathIndices,
      semaphoreTreeSiblings: identityMerkleProof.pathElements.map((x) =>
        BigNumber.from(x).toString()
      ),
      semaphoreRoots: identityRoots,
      chainID: vanchorInputs.chainID,
      publicAmount: vanchorInputs.publicAmount,
      extDataHash: extDataHash,

      // data for 2 transaction inputs
      inputNullifier: vanchorInputs.inputNullifier,
      inAmount: vanchorInputs.inAmount,
      inPrivateKey: vanchorInputs.inPrivateKey,
      inBlinding: vanchorInputs.inBlinding,
      inPathIndices: vanchorInputs.inPathIndices,
      inPathElements: vanchorInputs.inPathElements.map((utxoPathElements) =>
        utxoPathElements.map((x) => BigNumber.from(x).toString())
      ),

      // data for 2 transaction outputs
      outputCommitment: vanchorInputs.outputCommitment,
      outChainID: vanchorInputs.outChainID,
      outAmount: vanchorInputs.outAmount,
      outPubkey: vanchorInputs.outPubkey,
      outSemaphoreTreePathIndices: outSemaphoreProofs.map((proof) =>
        proof.pathIndices.map((idx) => BigNumber.from(idx).toString())
      ),
      outSemaphoreTreeElements: outSemaphoreProofs.map((proof) =>
        proof.pathElements.map((elem) => {
          if (BigNumber.isBigNumber(elem)) {
            return elem.toString();
          }
          return BigNumber.from(elem).toString();
        })
      ),
      outBlinding: vanchorInputs.outBlinding,
      vanchorRoots: vanchorInputs.roots,
    };

    let proof = await snarkjs.groth16.fullProve(
      proofInputs,
      this.smallCircuitZkComponents.wasm,
      this.smallCircuitZkComponents.zkey
    );
    return proof;
  }

  public async setupTransaction(
    keypair: Keypair,
    identityRootInputs: string[],
    identityMerkleProof: MerkleProof,
    outSemaphoreProofs: MerkleProof[],
    vanchorInput: UTXOInputs,
    extDataHash: string
  ): Promise<IIdentityVariableAnchorPublicInputs> {
    const fullProof = await this.generateProof(
      keypair,
      identityRootInputs,
      identityMerkleProof,
      outSemaphoreProofs,
      extDataHash,
      vanchorInput
    );
    const proof = await this.generateProofCalldata(fullProof);
    const vKey = await snarkjs.zKey.exportVerificationKey(this.smallCircuitZkComponents.zkey);
    const calldata = await snarkjs.groth16.exportSolidityCallData(
      fullProof.proof,
      fullProof.publicSignals
    );

    const publicInputs: IIdentityVariableAnchorPublicInputs = this.generatePublicInputs(
      proof,
      calldata
    );

    const is_valid: boolean = await snarkjs.groth16.verify(
      vKey,
      fullProof.publicSignals,
      fullProof.proof
    );
    assert.strictEqual(is_valid, true);

    return publicInputs;
  }

  public generateIdentityMerkleProof(pubkey: string): MerkleProof {
    const idx = this.group.indexOf(pubkey);
    const identityMerkleProof: MerkleProof = this.group.generateProofOfMembership(idx);
    return identityMerkleProof;
  }
  public populateIdentityRootsForProof(): string[] {
    return this.group.getRoots().map((bignum: BigNumber) => bignum.toString());
  }

  public async generateExtData(
    recipient: string,
    extAmount: BigNumber,
    relayer: string,
    fee: BigNumber,
    refund: BigNumber,
    wrapUnwrapToken: string,
    encryptedOutput1: string,
    encryptedOutput2: string
  ): Promise<{ extData: ExtData; extDataHash: BigNumber }> {
    const extData = {
      recipient: toFixedHex(recipient, 20),
      extAmount: toFixedHex(extAmount),
      relayer: toFixedHex(relayer, 20),
      fee: toFixedHex(fee),
      refund: toFixedHex(refund.toString()),
      token: toFixedHex(wrapUnwrapToken, 20),
      encryptedOutput1,
      encryptedOutput2,
    };

    const extDataHash = await getVAnchorExtDataHash(
      encryptedOutput1,
      encryptedOutput2,
      extAmount.toString(),
      BigNumber.from(fee).toString(),
      recipient,
      relayer,
      refund.toString(),
      wrapUnwrapToken
    );
    return { extData, extDataHash };
  }

  public generateOutputSemaphoreProof(outputs: Utxo[]): MerkleProof[] {
    const outSemaphoreProofs = outputs.map((utxo) => {
      const leaf = utxo.keypair.getPubKey();
      if (Number(utxo.amount) > 0) {
        const idx = this.group.indexOf(leaf);
        return this.group.generateProofOfMembership(idx);
      } else {
        const inputMerklePathIndices = new Array(this.group.depth).fill(0);
        const inputMerklePathElements = new Array(this.group.depth).fill(0);

        return {
          pathIndices: inputMerklePathIndices,
          pathElements: inputMerklePathElements,
          element: BigNumber.from(0),
          merkleRoot: BigNumber.from(0),
        };
      }
    });
    return outSemaphoreProofs;
  }

  public async generateUTXOInputs(
    inputs: Utxo[],
    outputs: Utxo[],
    chainId: number,
    extAmount: BigNumber,
    fee: BigNumber,
    extDataHash: BigNumber
  ): Promise<UTXOInputs> {
    const vanchorRoots = await this.populateVAnchorRootsForProof();
    const vanchorMerkleProof = inputs.map((x) => this.getMerkleProof(x));

    const vanchorInput: UTXOInputs = await generateVariableWitnessInput(
      vanchorRoots.map((root) => BigNumber.from(root)),
      chainId,
      inputs,
      outputs,
      extAmount,
      fee,
      BigNumber.from(extDataHash),
      vanchorMerkleProof
    );

    return vanchorInput;
  }
  // Maintain tree state after insertions
  public async updateTree(outputs: Utxo[]): Promise<void> {
    outputs.forEach((x) => {
      this.tree.insert(u8aToHex(x.commitment));
      let numOfElements = this.tree.number_of_elements();
      this.depositHistory[numOfElements - 1] = toFixedHex(this.tree.root().toString());
    });
  }

  public async transact(
    keypair: Keypair,
    inputs: Utxo[],
    outputs: Utxo[],
    fee: BigNumberish,
    refund: BigNumberish,
    recipient: string,
    relayer: string,
    wrapUnwrapToken: string
  ): Promise<ethers.ContractTransaction> {
    const chainId = getChainIdType(await this.signer.getChainId());

    inputs = await this.padUtxos(inputs, 16, this.signer);

    outputs = await this.padUtxos(outputs, 2, this.signer);

    let extAmount = await this.getExtAmount(inputs, outputs, fee);

    const vanchorMerkleProof = inputs.map((x) => this.getMerkleProof(x));
    const identityRootInputs = this.populateIdentityRootsForProof();
    const identityMerkleProof: MerkleProof = this.generateIdentityMerkleProof(keypair.getPubKey());

    if (wrapUnwrapToken.length === 0) {
      wrapUnwrapToken = this.token;
    }

    const { extData, extDataHash } = await this.generateExtData(
      recipient,
      extAmount,
      relayer,
      BigNumber.from(fee),
      BigNumber.from(refund),
      wrapUnwrapToken,
      outputs[0].encrypt(),
      outputs[1].encrypt()
    );

    const vanchorInput: UTXOInputs = await this.generateUTXOInputs(
      inputs,
      outputs,
      chainId,
      extAmount,
      BigNumber.from(fee),
      extDataHash
    );

    const outSemaphoreProofs = this.generateOutputSemaphoreProof(outputs);

    const publicInputs = await this.setupTransaction(
      keypair,
      identityRootInputs,
      identityMerkleProof,
      outSemaphoreProofs,
      vanchorInput,
      extDataHash.toString()
    );

    let tx = await this.contract.transact(
      publicInputs.proof,
      ZERO_BYTES32,
      {
        recipient: extData.recipient,
        extAmount: extData.extAmount,
        relayer: extData.relayer,
        fee: extData.fee,
        refund: extData.refund,
        token: extData.token,
      },
      {
        roots: publicInputs.vanchorRoots,
        extensionRoots: publicInputs.identityRoots,
        inputNullifiers: publicInputs.inputNullifiers,
        outputCommitments: [publicInputs.outputCommitments[0], publicInputs.outputCommitments[1]],
        publicAmount: publicInputs.publicAmount,
        extDataHash: publicInputs.extDataHash,
      },
      extData,
      { gasLimit: '0x5B8D80' }
    );
    const receipt = await tx.wait();

    // Add the leaves to the tree
    await this.updateTree(outputs);

    return tx;
  }
}

export default IdentityVAnchor;
