import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.15.0');

const _descriptor_0 = new __compactRuntime.CompactTypeUnsignedInteger(65535n, 2);

const _descriptor_1 = __compactRuntime.CompactTypeBoolean;

const _descriptor_2 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

class _tuple_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_2.alignment());
  }
  fromValue(value_0) {
    return [
      _descriptor_2.fromValue(value_0),
      _descriptor_2.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0[0]).concat(_descriptor_2.toValue(value_0[1]));
  }
}

const _descriptor_3 = new _tuple_0();

const _descriptor_4 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_5 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

const _descriptor_6 = new __compactRuntime.CompactTypeUnsignedInteger(3402823669209384634633746074317682114559999n, 18);

const _descriptor_7 = new __compactRuntime.CompactTypeUnsignedInteger(368934881474191032319998n, 10);

class _Either_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_4.alignment().concat(_descriptor_4.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_1.fromValue(value_0),
      left: _descriptor_4.fromValue(value_0),
      right: _descriptor_4.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.is_left).concat(_descriptor_4.toValue(value_0.left).concat(_descriptor_4.toValue(value_0.right)));
  }
}

const _descriptor_8 = new _Either_0();

class _ContractAddress_0 {
  alignment() {
    return _descriptor_4.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_4.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_4.toValue(value_0.bytes);
  }
}

const _descriptor_9 = new _ContractAddress_0();

const _descriptor_10 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    if (typeof(witnesses_0.divFloor) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named divFloor');
    }
    if (typeof(witnesses_0.sqrtFloor) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named sqrtFloor');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      initialize: (...args_1) => {
        if (args_1.length !== 5) {
          throw new __compactRuntime.CompactError(`initialize: expected 5 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amount0_0 = args_1[1];
        const amount1_0 = args_1[2];
        const depositor_0 = args_1[3];
        const fee_0 = args_1[4];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('initialize',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 60 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amount0_0) === 'bigint' && amount0_0 >= 0n && amount0_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('initialize',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'LiquidityPool.compact line 60 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount0_0)
        }
        if (!(typeof(amount1_0) === 'bigint' && amount1_0 >= 0n && amount1_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('initialize',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'LiquidityPool.compact line 60 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount1_0)
        }
        if (!(depositor_0.buffer instanceof ArrayBuffer && depositor_0.BYTES_PER_ELEMENT === 1 && depositor_0.length === 32)) {
          __compactRuntime.typeError('initialize',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'LiquidityPool.compact line 60 char 1',
                                     'Bytes<32>',
                                     depositor_0)
        }
        if (!(typeof(fee_0) === 'bigint' && fee_0 >= 0n && fee_0 <= 65535n)) {
          __compactRuntime.typeError('initialize',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'LiquidityPool.compact line 60 char 1',
                                     'Uint<0..65536>',
                                     fee_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(amount0_0).concat(_descriptor_2.toValue(amount1_0).concat(_descriptor_4.toValue(depositor_0).concat(_descriptor_0.toValue(fee_0)))),
            alignment: _descriptor_2.alignment().concat(_descriptor_2.alignment().concat(_descriptor_4.alignment().concat(_descriptor_0.alignment())))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._initialize_0(context,
                                            partialProofData,
                                            amount0_0,
                                            amount1_0,
                                            depositor_0,
                                            fee_0);
        partialProofData.output = { value: _descriptor_2.toValue(result_0), alignment: _descriptor_2.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      addLiquidity: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`addLiquidity: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amount0_0 = args_1[1];
        const amount1_0 = args_1[2];
        const depositor_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('addLiquidity',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 98 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amount0_0) === 'bigint' && amount0_0 >= 0n && amount0_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('addLiquidity',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'LiquidityPool.compact line 98 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount0_0)
        }
        if (!(typeof(amount1_0) === 'bigint' && amount1_0 >= 0n && amount1_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('addLiquidity',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'LiquidityPool.compact line 98 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount1_0)
        }
        if (!(depositor_0.buffer instanceof ArrayBuffer && depositor_0.BYTES_PER_ELEMENT === 1 && depositor_0.length === 32)) {
          __compactRuntime.typeError('addLiquidity',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'LiquidityPool.compact line 98 char 1',
                                     'Bytes<32>',
                                     depositor_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(amount0_0).concat(_descriptor_2.toValue(amount1_0).concat(_descriptor_4.toValue(depositor_0))),
            alignment: _descriptor_2.alignment().concat(_descriptor_2.alignment().concat(_descriptor_4.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._addLiquidity_0(context,
                                              partialProofData,
                                              amount0_0,
                                              amount1_0,
                                              depositor_0);
        partialProofData.output = { value: _descriptor_2.toValue(result_0), alignment: _descriptor_2.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      removeLiquidity: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`removeLiquidity: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const lpAmount_0 = args_1[1];
        const withdrawer_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('removeLiquidity',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 145 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(lpAmount_0) === 'bigint' && lpAmount_0 >= 0n && lpAmount_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('removeLiquidity',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'LiquidityPool.compact line 145 char 1',
                                     'Uint<0..18446744073709551616>',
                                     lpAmount_0)
        }
        if (!(withdrawer_0.buffer instanceof ArrayBuffer && withdrawer_0.BYTES_PER_ELEMENT === 1 && withdrawer_0.length === 32)) {
          __compactRuntime.typeError('removeLiquidity',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'LiquidityPool.compact line 145 char 1',
                                     'Bytes<32>',
                                     withdrawer_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(lpAmount_0).concat(_descriptor_4.toValue(withdrawer_0)),
            alignment: _descriptor_2.alignment().concat(_descriptor_4.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._removeLiquidity_0(context,
                                                 partialProofData,
                                                 lpAmount_0,
                                                 withdrawer_0);
        partialProofData.output = { value: _descriptor_3.toValue(result_0), alignment: _descriptor_3.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      swap: (...args_1) => {
        if (args_1.length !== 5) {
          throw new __compactRuntime.CompactError(`swap: expected 5 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amountIn_0 = args_1[1];
        const minOut_0 = args_1[2];
        const zeroForOne_0 = args_1[3];
        const trader_0 = args_1[4];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('swap',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 193 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amountIn_0) === 'bigint' && amountIn_0 >= 0n && amountIn_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('swap',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'LiquidityPool.compact line 193 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amountIn_0)
        }
        if (!(typeof(minOut_0) === 'bigint' && minOut_0 >= 0n && minOut_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('swap',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'LiquidityPool.compact line 193 char 1',
                                     'Uint<0..18446744073709551616>',
                                     minOut_0)
        }
        if (!(typeof(zeroForOne_0) === 'boolean')) {
          __compactRuntime.typeError('swap',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'LiquidityPool.compact line 193 char 1',
                                     'Boolean',
                                     zeroForOne_0)
        }
        if (!(trader_0.buffer instanceof ArrayBuffer && trader_0.BYTES_PER_ELEMENT === 1 && trader_0.length === 32)) {
          __compactRuntime.typeError('swap',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'LiquidityPool.compact line 193 char 1',
                                     'Bytes<32>',
                                     trader_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(amountIn_0).concat(_descriptor_2.toValue(minOut_0).concat(_descriptor_1.toValue(zeroForOne_0).concat(_descriptor_4.toValue(trader_0)))),
            alignment: _descriptor_2.alignment().concat(_descriptor_2.alignment().concat(_descriptor_1.alignment().concat(_descriptor_4.alignment())))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._swap_0(context,
                                      partialProofData,
                                      amountIn_0,
                                      minOut_0,
                                      zeroForOne_0,
                                      trader_0);
        partialProofData.output = { value: _descriptor_2.toValue(result_0), alignment: _descriptor_2.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      getReserves: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`getReserves: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('getReserves',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 244 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._getReserves_0(context, partialProofData);
        partialProofData.output = { value: _descriptor_3.toValue(result_0), alignment: _descriptor_3.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      getUserBalance: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`getUserBalance: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const user_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('getUserBalance',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 248 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(user_0.buffer instanceof ArrayBuffer && user_0.BYTES_PER_ELEMENT === 1 && user_0.length === 32)) {
          __compactRuntime.typeError('getUserBalance',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'LiquidityPool.compact line 248 char 1',
                                     'Bytes<32>',
                                     user_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_4.toValue(user_0),
            alignment: _descriptor_4.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._getUserBalance_0(context,
                                                partialProofData,
                                                user_0);
        partialProofData.output = { value: _descriptor_2.toValue(result_0), alignment: _descriptor_2.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      getAmountOut: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`getAmountOut: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amountIn_0 = args_1[1];
        const zeroForOne_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('getAmountOut',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 254 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amountIn_0) === 'bigint' && amountIn_0 >= 0n && amountIn_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('getAmountOut',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'LiquidityPool.compact line 254 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amountIn_0)
        }
        if (!(typeof(zeroForOne_0) === 'boolean')) {
          __compactRuntime.typeError('getAmountOut',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'LiquidityPool.compact line 254 char 1',
                                     'Boolean',
                                     zeroForOne_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(amountIn_0).concat(_descriptor_1.toValue(zeroForOne_0)),
            alignment: _descriptor_2.alignment().concat(_descriptor_1.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._getAmountOut_0(context,
                                              partialProofData,
                                              amountIn_0,
                                              zeroForOne_0);
        partialProofData.output = { value: _descriptor_2.toValue(result_0), alignment: _descriptor_2.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      getAmountIn: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`getAmountIn: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amountOut_0 = args_1[1];
        const zeroForOne_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('getAmountIn',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 279 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amountOut_0) === 'bigint' && amountOut_0 >= 0n && amountOut_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('getAmountIn',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'LiquidityPool.compact line 279 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amountOut_0)
        }
        if (!(typeof(zeroForOne_0) === 'boolean')) {
          __compactRuntime.typeError('getAmountIn',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'LiquidityPool.compact line 279 char 1',
                                     'Boolean',
                                     zeroForOne_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(amountOut_0).concat(_descriptor_1.toValue(zeroForOne_0)),
            alignment: _descriptor_2.alignment().concat(_descriptor_1.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._getAmountIn_0(context,
                                             partialProofData,
                                             amountOut_0,
                                             zeroForOne_0);
        partialProofData.output = { value: _descriptor_2.toValue(result_0), alignment: _descriptor_2.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      getFeeBps: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`getFeeBps: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('getFeeBps',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 303 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._getFeeBps_0(context, partialProofData);
        partialProofData.output = { value: _descriptor_0.toValue(result_0), alignment: _descriptor_0.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      isInitialized: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`isInitialized: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('isInitialized',
                                     'argument 1 (as invoked from Typescript)',
                                     'LiquidityPool.compact line 307 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._isInitialized_0(context, partialProofData);
        partialProofData.output = { value: _descriptor_1.toValue(result_0), alignment: _descriptor_1.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      }
    };
    this.impureCircuits = {
      initialize: this.circuits.initialize,
      addLiquidity: this.circuits.addLiquidity,
      removeLiquidity: this.circuits.removeLiquidity,
      swap: this.circuits.swap,
      getReserves: this.circuits.getReserves,
      getUserBalance: this.circuits.getUserBalance,
      getAmountOut: this.circuits.getAmountOut,
      getAmountIn: this.circuits.getAmountIn,
      getFeeBps: this.circuits.getFeeBps,
      isInitialized: this.circuits.isInitialized
    };
    this.provableCircuits = {
      initialize: this.circuits.initialize,
      addLiquidity: this.circuits.addLiquidity,
      removeLiquidity: this.circuits.removeLiquidity,
      swap: this.circuits.swap,
      getReserves: this.circuits.getReserves,
      getUserBalance: this.circuits.getUserBalance,
      getAmountOut: this.circuits.getAmountOut,
      getAmountIn: this.circuits.getAmountIn,
      getFeeBps: this.circuits.getFeeBps,
      isInitialized: this.circuits.isInitialized
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialPrivateState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialPrivateState' in argument 1 (as invoked from Typescript)`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('initialize', new __compactRuntime.ContractOperation());
    state_0.setOperation('addLiquidity', new __compactRuntime.ContractOperation());
    state_0.setOperation('removeLiquidity', new __compactRuntime.ContractOperation());
    state_0.setOperation('swap', new __compactRuntime.ContractOperation());
    state_0.setOperation('getReserves', new __compactRuntime.ContractOperation());
    state_0.setOperation('getUserBalance', new __compactRuntime.ContractOperation());
    state_0.setOperation('getAmountOut', new __compactRuntime.ContractOperation());
    state_0.setOperation('getAmountIn', new __compactRuntime.ContractOperation());
    state_0.setOperation('getFeeBps', new __compactRuntime.ContractOperation());
    state_0.setOperation('isInitialized', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext(__compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(0n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(1n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(2n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(3n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(0n),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(4n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(false),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(5n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(6n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _divFloor_0(context, partialProofData, numerator_0, denominator_0) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.divFloor(witnessContext_0,
                                                                   numerator_0,
                                                                   denominator_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'bigint' && result_0 >= 0n && result_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('divFloor',
                                 'return value',
                                 'LiquidityPool.compact line 26 char 1',
                                 'Uint<0..18446744073709551616>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_2.toValue(result_0),
      alignment: _descriptor_2.alignment()
    });
    return result_0;
  }
  _sqrtFloor_0(context, partialProofData, value_0) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.sqrtFloor(witnessContext_0,
                                                                    value_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'bigint' && result_0 >= 0n && result_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('sqrtFloor',
                                 'return value',
                                 'LiquidityPool.compact line 27 char 1',
                                 'Uint<0..18446744073709551616>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_2.toValue(result_0),
      alignment: _descriptor_2.alignment()
    });
    return result_0;
  }
  _verifyFloorDivision_0(numerator_0, denominator_0, quotient_0) {
    __compactRuntime.assert(denominator_0 > 0n, 'Division by zero');
    const qTimesD_0 = quotient_0 * denominator_0;
    const nWide_0 = numerator_0;
    __compactRuntime.assert(qTimesD_0 <= nWide_0, 'Invalid quotient lower bound');
    const remainder_0 = (__compactRuntime.assert(nWide_0 >= qTimesD_0,
                                                 'result of subtraction would be negative'),
                         nWide_0 - qTimesD_0);
    const dWide_0 = denominator_0;
    __compactRuntime.assert(remainder_0 < dWide_0,
                            'Invalid quotient upper bound');
    return [];
  }
  _verifyFloorSqrt_0(value_0, root_0) {
    const r2_0 = root_0 * root_0;
    __compactRuntime.assert(r2_0 <= value_0, 'Invalid sqrt lower bound');
    const delta_0 = (__compactRuntime.assert(value_0 >= r2_0,
                                             'result of subtraction would be negative'),
                     value_0 - r2_0);
    const nextStep_0 = root_0 * 2n + 1n;
    let t_0;
    __compactRuntime.assert((t_0 = delta_0, t_0 < nextStep_0),
                            'Invalid sqrt upper bound');
    return [];
  }
  _initialize_0(context,
                partialProofData,
                amount0_0,
                amount1_0,
                depositor_0,
                fee_0)
  {
    const amount0Pub_0 = amount0_0;
    const amount1Pub_0 = amount1_0;
    const depositorPub_0 = depositor_0;
    const feePub_0 = fee_0;
    __compactRuntime.assert(!_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_10.toValue(4n),
                                                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                                                        { popeq: { cached: false,
                                                                                                   result: undefined } }]).value),
                            'Pool already initialized');
    __compactRuntime.assert(amount0Pub_0 > 0n, 'Amount0 must be positive');
    __compactRuntime.assert(amount1Pub_0 > 0n, 'Amount1 must be positive');
    __compactRuntime.assert(feePub_0 <= 1000n, 'Fee too high');
    const product_0 = amount0Pub_0 * amount1Pub_0;
    const liquidityWitness_0 = this._sqrtFloor_0(context,
                                                 partialProofData,
                                                 product_0);
    this._verifyFloorSqrt_0(product_0, liquidityWitness_0);
    const liquidity_0 = liquidityWitness_0;
    __compactRuntime.assert(liquidity_0 > 1000n,
                            'Insufficient initial liquidity');
    const minted_0 = (__compactRuntime.assert(liquidity_0 >= 1000n,
                                              'result of subtraction would be negative'),
                      liquidity_0 - 1000n);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(0n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(amount0Pub_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(1n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(amount1Pub_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(2n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(liquidity_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(3n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(product_0),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(5n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(feePub_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(4n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(true),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_10.toValue(6n),
                                                                  alignment: _descriptor_10.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(depositorPub_0),
                                                                                              alignment: _descriptor_4.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(minted_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return minted_0;
  }
  _addLiquidity_0(context, partialProofData, amount0_0, amount1_0, depositor_0)
  {
    const amount0Pub_0 = amount0_0;
    const amount1Pub_0 = amount1_0;
    const depositorPub_0 = depositor_0;
    __compactRuntime.assert(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(4n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                            'Pool not initialized');
    __compactRuntime.assert(amount0Pub_0 > 0n, 'Amount0 must be positive');
    __compactRuntime.assert(amount1Pub_0 > 0n, 'Amount1 must be positive');
    const r0_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                           partialProofData,
                                                                           [
                                                                            { dup: { n: 0 } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_10.toValue(0n),
                                                                                                       alignment: _descriptor_10.alignment() } }] } },
                                                                            { popeq: { cached: false,
                                                                                       result: undefined } }]).value);
    const r1_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                           partialProofData,
                                                                           [
                                                                            { dup: { n: 0 } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_10.toValue(1n),
                                                                                                       alignment: _descriptor_10.alignment() } }] } },
                                                                            { popeq: { cached: false,
                                                                                       result: undefined } }]).value);
    const supply_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                               partialProofData,
                                                                               [
                                                                                { dup: { n: 0 } },
                                                                                { idx: { cached: false,
                                                                                         pushPath: false,
                                                                                         path: [
                                                                                                { tag: 'value',
                                                                                                  value: { value: _descriptor_10.toValue(2n),
                                                                                                           alignment: _descriptor_10.alignment() } }] } },
                                                                                { popeq: { cached: false,
                                                                                           result: undefined } }]).value);
    const leftRatio_0 = amount0Pub_0 * r1_0;
    const rightRatio_0 = amount1Pub_0 * r0_0;
    __compactRuntime.assert(this._equal_0(leftRatio_0, rightRatio_0),
                            'Amounts not proportional');
    const num_0 = amount0Pub_0 * supply_0;
    const den_0 = r0_0;
    const lpTokensWitness_0 = this._divFloor_0(context,
                                               partialProofData,
                                               num_0,
                                               den_0);
    this._verifyFloorDivision_0(num_0, den_0, lpTokensWitness_0);
    const lpTokens_0 = lpTokensWitness_0;
    __compactRuntime.assert(lpTokens_0 > 0n, 'Insufficient LP minted');
    const newReserve0_0 = ((t1) => {
                            if (t1 > 18446744073709551615n) {
                              throw new __compactRuntime.CompactError('LiquidityPool.compact line 129 char 33: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                            }
                            return t1;
                          })(r0_0 + amount0Pub_0);
    const newReserve1_0 = ((t1) => {
                            if (t1 > 18446744073709551615n) {
                              throw new __compactRuntime.CompactError('LiquidityPool.compact line 130 char 33: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                            }
                            return t1;
                          })(r1_0 + amount1Pub_0);
    const newSupply_0 = ((t1) => {
                          if (t1 > 18446744073709551615n) {
                            throw new __compactRuntime.CompactError('LiquidityPool.compact line 131 char 31: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                          }
                          return t1;
                        })(supply_0 + lpTokens_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(0n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(newReserve0_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(1n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(newReserve1_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(2n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(newSupply_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_0 = newReserve0_0 * newReserve1_0;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(3n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(tmp_0),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const current_0 = _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                partialProofData,
                                                                                [
                                                                                 { dup: { n: 0 } },
                                                                                 { idx: { cached: false,
                                                                                          pushPath: false,
                                                                                          path: [
                                                                                                 { tag: 'value',
                                                                                                   value: { value: _descriptor_10.toValue(6n),
                                                                                                            alignment: _descriptor_10.alignment() } }] } },
                                                                                 { push: { storage: false,
                                                                                           value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(depositorPub_0),
                                                                                                                                        alignment: _descriptor_4.alignment() }).encode() } },
                                                                                 'member',
                                                                                 { popeq: { cached: true,
                                                                                            result: undefined } }]).value)
                      ?
                      _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                partialProofData,
                                                                                [
                                                                                 { dup: { n: 0 } },
                                                                                 { idx: { cached: false,
                                                                                          pushPath: false,
                                                                                          path: [
                                                                                                 { tag: 'value',
                                                                                                   value: { value: _descriptor_10.toValue(6n),
                                                                                                            alignment: _descriptor_10.alignment() } }] } },
                                                                                 { idx: { cached: false,
                                                                                          pushPath: false,
                                                                                          path: [
                                                                                                 { tag: 'value',
                                                                                                   value: { value: _descriptor_4.toValue(depositorPub_0),
                                                                                                            alignment: _descriptor_4.alignment() } }] } },
                                                                                 { popeq: { cached: false,
                                                                                            result: undefined } }]).value)
                      :
                      0n;
    const tmp_1 = ((t1) => {
                    if (t1 > 18446744073709551615n) {
                      throw new __compactRuntime.CompactError('LiquidityPool.compact line 139 char 35: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                    }
                    return t1;
                  })(current_0 + lpTokens_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_10.toValue(6n),
                                                                  alignment: _descriptor_10.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(depositorPub_0),
                                                                                              alignment: _descriptor_4.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_1),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return lpTokens_0;
  }
  _removeLiquidity_0(context, partialProofData, lpAmount_0, withdrawer_0) {
    const lpAmountPub_0 = lpAmount_0;
    const withdrawerPub_0 = withdrawer_0;
    __compactRuntime.assert(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(4n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                            'Pool not initialized');
    __compactRuntime.assert(lpAmountPub_0 > 0n, 'Invalid LP amount');
    const bal_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                            partialProofData,
                                                                            [
                                                                             { dup: { n: 0 } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_10.toValue(6n),
                                                                                                        alignment: _descriptor_10.alignment() } }] } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_4.toValue(withdrawerPub_0),
                                                                                                        alignment: _descriptor_4.alignment() } }] } },
                                                                             { popeq: { cached: false,
                                                                                        result: undefined } }]).value);
    __compactRuntime.assert(bal_0 >= lpAmountPub_0, 'Insufficient LP balance');
    const r0_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                           partialProofData,
                                                                           [
                                                                            { dup: { n: 0 } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_10.toValue(0n),
                                                                                                       alignment: _descriptor_10.alignment() } }] } },
                                                                            { popeq: { cached: false,
                                                                                       result: undefined } }]).value);
    const r1_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                           partialProofData,
                                                                           [
                                                                            { dup: { n: 0 } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_10.toValue(1n),
                                                                                                       alignment: _descriptor_10.alignment() } }] } },
                                                                            { popeq: { cached: false,
                                                                                       result: undefined } }]).value);
    const supply_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                               partialProofData,
                                                                               [
                                                                                { dup: { n: 0 } },
                                                                                { idx: { cached: false,
                                                                                         pushPath: false,
                                                                                         path: [
                                                                                                { tag: 'value',
                                                                                                  value: { value: _descriptor_10.toValue(2n),
                                                                                                           alignment: _descriptor_10.alignment() } }] } },
                                                                                { popeq: { cached: false,
                                                                                           result: undefined } }]).value);
    const den_0 = supply_0;
    const num0_0 = lpAmountPub_0 * r0_0;
    const num1_0 = lpAmountPub_0 * r1_0;
    const amount0Witness_0 = this._divFloor_0(context,
                                              partialProofData,
                                              num0_0,
                                              den_0);
    const amount1Witness_0 = this._divFloor_0(context,
                                              partialProofData,
                                              num1_0,
                                              den_0);
    this._verifyFloorDivision_0(num0_0, den_0, amount0Witness_0);
    this._verifyFloorDivision_0(num1_0, den_0, amount1Witness_0);
    const amount0_0 = amount0Witness_0;
    const amount1_0 = amount1Witness_0;
    __compactRuntime.assert(amount0_0 > 0n, 'Insufficient amount0 out');
    __compactRuntime.assert(amount1_0 > 0n, 'Insufficient amount1 out');
    const newReserve0_0 = (__compactRuntime.assert(r0_0 >= amount0_0,
                                                   'result of subtraction would be negative'),
                           r0_0 - amount0_0);
    const newReserve1_0 = (__compactRuntime.assert(r1_0 >= amount1_0,
                                                   'result of subtraction would be negative'),
                           r1_0 - amount1_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(0n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(newReserve0_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(1n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(newReserve1_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_0 = (__compactRuntime.assert(supply_0 >= lpAmountPub_0,
                                           'result of subtraction would be negative'),
                   supply_0 - lpAmountPub_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(2n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_1 = newReserve0_0 * newReserve1_0;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(3n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(tmp_1),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_2 = (__compactRuntime.assert(bal_0 >= lpAmountPub_0,
                                           'result of subtraction would be negative'),
                   bal_0 - lpAmountPub_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_10.toValue(6n),
                                                                  alignment: _descriptor_10.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(withdrawerPub_0),
                                                                                              alignment: _descriptor_4.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_2),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [amount0_0, amount1_0];
  }
  _swap_0(context,
          partialProofData,
          amountIn_0,
          minOut_0,
          zeroForOne_0,
          trader_0)
  {
    const amountInPub_0 = amountIn_0;
    const minOutPub_0 = minOut_0;
    const zeroForOnePub_0 = zeroForOne_0;
    const traderPub_0 = trader_0;
    __compactRuntime.assert(this._equal_1(traderPub_0, traderPub_0),
                            'invalid trader witness');
    __compactRuntime.assert(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(4n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                            'Pool not initialized');
    __compactRuntime.assert(amountInPub_0 > 0n, 'Invalid amount in');
    const reserveIn_0 = zeroForOnePub_0 ?
                        _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                  partialProofData,
                                                                                  [
                                                                                   { dup: { n: 0 } },
                                                                                   { idx: { cached: false,
                                                                                            pushPath: false,
                                                                                            path: [
                                                                                                   { tag: 'value',
                                                                                                     value: { value: _descriptor_10.toValue(0n),
                                                                                                              alignment: _descriptor_10.alignment() } }] } },
                                                                                   { popeq: { cached: false,
                                                                                              result: undefined } }]).value)
                        :
                        _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                  partialProofData,
                                                                                  [
                                                                                   { dup: { n: 0 } },
                                                                                   { idx: { cached: false,
                                                                                            pushPath: false,
                                                                                            path: [
                                                                                                   { tag: 'value',
                                                                                                     value: { value: _descriptor_10.toValue(1n),
                                                                                                              alignment: _descriptor_10.alignment() } }] } },
                                                                                   { popeq: { cached: false,
                                                                                              result: undefined } }]).value);
    const reserveOut_0 = zeroForOnePub_0 ?
                         _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                   partialProofData,
                                                                                   [
                                                                                    { dup: { n: 0 } },
                                                                                    { idx: { cached: false,
                                                                                             pushPath: false,
                                                                                             path: [
                                                                                                    { tag: 'value',
                                                                                                      value: { value: _descriptor_10.toValue(1n),
                                                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                                                    { popeq: { cached: false,
                                                                                               result: undefined } }]).value)
                         :
                         _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                   partialProofData,
                                                                                   [
                                                                                    { dup: { n: 0 } },
                                                                                    { idx: { cached: false,
                                                                                             pushPath: false,
                                                                                             path: [
                                                                                                    { tag: 'value',
                                                                                                      value: { value: _descriptor_10.toValue(0n),
                                                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                                                    { popeq: { cached: false,
                                                                                               result: undefined } }]).value);
    let t_0;
    const feeMul_0 = (t_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(5n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                      (__compactRuntime.assert(10000n >= t_0,
                                               'result of subtraction would be negative'),
                       10000n - t_0));
    const amountInWithFee_0 = amountInPub_0 * feeMul_0;
    const numerator_0 = amountInWithFee_0 * reserveOut_0;
    const leftDen_0 = reserveIn_0 * 10000n;
    const denominator_0 = leftDen_0 + amountInWithFee_0;
    const amountOutWitness_0 = this._divFloor_0(context,
                                                partialProofData,
                                                numerator_0,
                                                denominator_0);
    this._verifyFloorDivision_0(numerator_0, denominator_0, amountOutWitness_0);
    const amountOut_0 = amountOutWitness_0;
    __compactRuntime.assert(amountOut_0 >= minOutPub_0, 'Slippage exceeded');
    __compactRuntime.assert(amountOut_0 > 0n, 'Zero output');
    __compactRuntime.assert(amountOut_0 < reserveOut_0, 'Insufficient liquidity');
    if (zeroForOnePub_0) {
      const tmp_0 = ((t1) => {
                      if (t1 > 18446744073709551615n) {
                        throw new __compactRuntime.CompactError('LiquidityPool.compact line 230 char 25: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                      }
                      return t1;
                    })(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                 partialProofData,
                                                                                 [
                                                                                  { dup: { n: 0 } },
                                                                                  { idx: { cached: false,
                                                                                           pushPath: false,
                                                                                           path: [
                                                                                                  { tag: 'value',
                                                                                                    value: { value: _descriptor_10.toValue(0n),
                                                                                                             alignment: _descriptor_10.alignment() } }] } },
                                                                                  { popeq: { cached: false,
                                                                                             result: undefined } }]).value)
                       +
                       amountInPub_0);
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(0n),
                                                                                                alignment: _descriptor_10.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_0),
                                                                                                alignment: _descriptor_2.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } }]);
      let t_1;
      const tmp_1 = (t_1 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                     partialProofData,
                                                                                     [
                                                                                      { dup: { n: 0 } },
                                                                                      { idx: { cached: false,
                                                                                               pushPath: false,
                                                                                               path: [
                                                                                                      { tag: 'value',
                                                                                                        value: { value: _descriptor_10.toValue(1n),
                                                                                                                 alignment: _descriptor_10.alignment() } }] } },
                                                                                      { popeq: { cached: false,
                                                                                                 result: undefined } }]).value),
                     (__compactRuntime.assert(t_1 >= amountOut_0,
                                              'result of subtraction would be negative'),
                      t_1 - amountOut_0));
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(1n),
                                                                                                alignment: _descriptor_10.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_1),
                                                                                                alignment: _descriptor_2.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } }]);
    } else {
      let t_2;
      const tmp_2 = (t_2 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                     partialProofData,
                                                                                     [
                                                                                      { dup: { n: 0 } },
                                                                                      { idx: { cached: false,
                                                                                               pushPath: false,
                                                                                               path: [
                                                                                                      { tag: 'value',
                                                                                                        value: { value: _descriptor_10.toValue(0n),
                                                                                                                 alignment: _descriptor_10.alignment() } }] } },
                                                                                      { popeq: { cached: false,
                                                                                                 result: undefined } }]).value),
                     (__compactRuntime.assert(t_2 >= amountOut_0,
                                              'result of subtraction would be negative'),
                      t_2 - amountOut_0));
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(0n),
                                                                                                alignment: _descriptor_10.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_2),
                                                                                                alignment: _descriptor_2.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } }]);
      const tmp_3 = ((t1) => {
                      if (t1 > 18446744073709551615n) {
                        throw new __compactRuntime.CompactError('LiquidityPool.compact line 234 char 25: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                      }
                      return t1;
                    })(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                 partialProofData,
                                                                                 [
                                                                                  { dup: { n: 0 } },
                                                                                  { idx: { cached: false,
                                                                                           pushPath: false,
                                                                                           path: [
                                                                                                  { tag: 'value',
                                                                                                    value: { value: _descriptor_10.toValue(1n),
                                                                                                             alignment: _descriptor_10.alignment() } }] } },
                                                                                  { popeq: { cached: false,
                                                                                             result: undefined } }]).value)
                       +
                       amountInPub_0);
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(1n),
                                                                                                alignment: _descriptor_10.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_3),
                                                                                                alignment: _descriptor_2.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } }]);
    }
    const newK_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                             partialProofData,
                                                                             [
                                                                              { dup: { n: 0 } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_10.toValue(0n),
                                                                                                         alignment: _descriptor_10.alignment() } }] } },
                                                                              { popeq: { cached: false,
                                                                                         result: undefined } }]).value)
                   *
                   _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                             partialProofData,
                                                                             [
                                                                              { dup: { n: 0 } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_10.toValue(1n),
                                                                                                         alignment: _descriptor_10.alignment() } }] } },
                                                                              { popeq: { cached: false,
                                                                                         result: undefined } }]).value);
    __compactRuntime.assert(newK_0
                            >=
                            _descriptor_5.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(3n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                            'Invariant violation');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(3n),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(newK_0),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return amountOut_0;
  }
  _getReserves_0(context, partialProofData) {
    return [_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                      partialProofData,
                                                                      [
                                                                       { dup: { n: 0 } },
                                                                       { idx: { cached: false,
                                                                                pushPath: false,
                                                                                path: [
                                                                                       { tag: 'value',
                                                                                         value: { value: _descriptor_10.toValue(0n),
                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                       { popeq: { cached: false,
                                                                                  result: undefined } }]).value),
            _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                      partialProofData,
                                                                      [
                                                                       { dup: { n: 0 } },
                                                                       { idx: { cached: false,
                                                                                pushPath: false,
                                                                                path: [
                                                                                       { tag: 'value',
                                                                                         value: { value: _descriptor_10.toValue(1n),
                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                       { popeq: { cached: false,
                                                                                  result: undefined } }]).value)];
  }
  _getUserBalance_0(context, partialProofData, user_0) {
    const userPub_0 = user_0;
    const bal_0 = _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                            partialProofData,
                                                                            [
                                                                             { dup: { n: 0 } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_10.toValue(6n),
                                                                                                        alignment: _descriptor_10.alignment() } }] } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_4.toValue(userPub_0),
                                                                                                        alignment: _descriptor_4.alignment() } }] } },
                                                                             { popeq: { cached: false,
                                                                                        result: undefined } }]).value);
    return bal_0;
  }
  _getAmountOut_0(context, partialProofData, amountIn_0, zeroForOne_0) {
    const amountInPub_0 = amountIn_0;
    const zeroForOnePub_0 = zeroForOne_0;
    __compactRuntime.assert(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(4n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                            'Pool not initialized');
    __compactRuntime.assert(amountInPub_0 > 0n, 'Invalid amount in');
    const reserveIn_0 = zeroForOnePub_0 ?
                        _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                  partialProofData,
                                                                                  [
                                                                                   { dup: { n: 0 } },
                                                                                   { idx: { cached: false,
                                                                                            pushPath: false,
                                                                                            path: [
                                                                                                   { tag: 'value',
                                                                                                     value: { value: _descriptor_10.toValue(0n),
                                                                                                              alignment: _descriptor_10.alignment() } }] } },
                                                                                   { popeq: { cached: false,
                                                                                              result: undefined } }]).value)
                        :
                        _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                  partialProofData,
                                                                                  [
                                                                                   { dup: { n: 0 } },
                                                                                   { idx: { cached: false,
                                                                                            pushPath: false,
                                                                                            path: [
                                                                                                   { tag: 'value',
                                                                                                     value: { value: _descriptor_10.toValue(1n),
                                                                                                              alignment: _descriptor_10.alignment() } }] } },
                                                                                   { popeq: { cached: false,
                                                                                              result: undefined } }]).value);
    const reserveOut_0 = zeroForOnePub_0 ?
                         _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                   partialProofData,
                                                                                   [
                                                                                    { dup: { n: 0 } },
                                                                                    { idx: { cached: false,
                                                                                             pushPath: false,
                                                                                             path: [
                                                                                                    { tag: 'value',
                                                                                                      value: { value: _descriptor_10.toValue(1n),
                                                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                                                    { popeq: { cached: false,
                                                                                               result: undefined } }]).value)
                         :
                         _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                   partialProofData,
                                                                                   [
                                                                                    { dup: { n: 0 } },
                                                                                    { idx: { cached: false,
                                                                                             pushPath: false,
                                                                                             path: [
                                                                                                    { tag: 'value',
                                                                                                      value: { value: _descriptor_10.toValue(0n),
                                                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                                                    { popeq: { cached: false,
                                                                                               result: undefined } }]).value);
    let t_0;
    const feeMul_0 = (t_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(5n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                      (__compactRuntime.assert(10000n >= t_0,
                                               'result of subtraction would be negative'),
                       10000n - t_0));
    const amountInWithFee_0 = amountInPub_0 * feeMul_0;
    const numerator_0 = amountInWithFee_0 * reserveOut_0;
    const leftDen_0 = reserveIn_0 * 10000n;
    const denominator_0 = leftDen_0 + amountInWithFee_0;
    const amountOutWitness_0 = this._divFloor_0(context,
                                                partialProofData,
                                                numerator_0,
                                                denominator_0);
    this._verifyFloorDivision_0(numerator_0, denominator_0, amountOutWitness_0);
    const amountOut_0 = amountOutWitness_0; return amountOut_0;
  }
  _getAmountIn_0(context, partialProofData, amountOut_0, zeroForOne_0) {
    const amountOutPub_0 = amountOut_0;
    const zeroForOnePub_0 = zeroForOne_0;
    __compactRuntime.assert(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(4n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                            'Pool not initialized');
    __compactRuntime.assert(amountOutPub_0 > 0n, 'Invalid amount out');
    const reserveIn_0 = zeroForOnePub_0 ?
                        _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                  partialProofData,
                                                                                  [
                                                                                   { dup: { n: 0 } },
                                                                                   { idx: { cached: false,
                                                                                            pushPath: false,
                                                                                            path: [
                                                                                                   { tag: 'value',
                                                                                                     value: { value: _descriptor_10.toValue(0n),
                                                                                                              alignment: _descriptor_10.alignment() } }] } },
                                                                                   { popeq: { cached: false,
                                                                                              result: undefined } }]).value)
                        :
                        _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                  partialProofData,
                                                                                  [
                                                                                   { dup: { n: 0 } },
                                                                                   { idx: { cached: false,
                                                                                            pushPath: false,
                                                                                            path: [
                                                                                                   { tag: 'value',
                                                                                                     value: { value: _descriptor_10.toValue(1n),
                                                                                                              alignment: _descriptor_10.alignment() } }] } },
                                                                                   { popeq: { cached: false,
                                                                                              result: undefined } }]).value);
    const reserveOut_0 = zeroForOnePub_0 ?
                         _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                   partialProofData,
                                                                                   [
                                                                                    { dup: { n: 0 } },
                                                                                    { idx: { cached: false,
                                                                                             pushPath: false,
                                                                                             path: [
                                                                                                    { tag: 'value',
                                                                                                      value: { value: _descriptor_10.toValue(1n),
                                                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                                                    { popeq: { cached: false,
                                                                                               result: undefined } }]).value)
                         :
                         _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                   partialProofData,
                                                                                   [
                                                                                    { dup: { n: 0 } },
                                                                                    { idx: { cached: false,
                                                                                             pushPath: false,
                                                                                             path: [
                                                                                                    { tag: 'value',
                                                                                                      value: { value: _descriptor_10.toValue(0n),
                                                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                                                    { popeq: { cached: false,
                                                                                               result: undefined } }]).value);
    __compactRuntime.assert(amountOutPub_0 < reserveOut_0,
                            'Insufficient liquidity');
    let t_0;
    const feeMul_0 = (t_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_10.toValue(5n),
                                                                                                                  alignment: _descriptor_10.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                      (__compactRuntime.assert(10000n >= t_0,
                                               'result of subtraction would be negative'),
                       10000n - t_0));
    const numerator_0 = reserveIn_0 * amountOutPub_0 * 10000n;
    const denominator_0 = (__compactRuntime.assert(reserveOut_0
                                                   >=
                                                   amountOutPub_0,
                                                   'result of subtraction would be negative'),
                           reserveOut_0 - amountOutPub_0)
                          *
                          feeMul_0;
    const amountInFloorWitness_0 = this._divFloor_0(context,
                                                    partialProofData,
                                                    numerator_0,
                                                    denominator_0);
    this._verifyFloorDivision_0(numerator_0,
                                denominator_0,
                                amountInFloorWitness_0);
    const amountInFloor_0 = amountInFloorWitness_0;
    return ((t1) => {
             if (t1 > 18446744073709551615n) {
               throw new __compactRuntime.CompactError('LiquidityPool.compact line 300 char 19: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
             }
             return t1;
           })(amountInFloor_0 + 1n);
  }
  _getFeeBps_0(context, partialProofData) {
    return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                     partialProofData,
                                                                     [
                                                                      { dup: { n: 0 } },
                                                                      { idx: { cached: false,
                                                                               pushPath: false,
                                                                               path: [
                                                                                      { tag: 'value',
                                                                                        value: { value: _descriptor_10.toValue(5n),
                                                                                                 alignment: _descriptor_10.alignment() } }] } },
                                                                      { popeq: { cached: false,
                                                                                 result: undefined } }]).value);
  }
  _isInitialized_0(context, partialProofData) {
    return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                     partialProofData,
                                                                     [
                                                                      { dup: { n: 0 } },
                                                                      { idx: { cached: false,
                                                                               pushPath: false,
                                                                               path: [
                                                                                      { tag: 'value',
                                                                                        value: { value: _descriptor_10.toValue(4n),
                                                                                                 alignment: _descriptor_10.alignment() } }] } },
                                                                      { popeq: { cached: false,
                                                                                 result: undefined } }]).value);
  }
  _equal_0(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_1(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()),
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({
  divFloor: (...args) => undefined, sqrtFloor: (...args) => undefined
});
export const pureCircuits = {};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
//# sourceMappingURL=index.js.map
