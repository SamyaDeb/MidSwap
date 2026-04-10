import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  divFloor(context: __compactRuntime.WitnessContext<Ledger, PS>,
           numerator_0: bigint,
           denominator_0: bigint): [PS, bigint];
  sqrtFloor(context: __compactRuntime.WitnessContext<Ledger, PS>,
            value_0: bigint): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  initialize(context: __compactRuntime.CircuitContext<PS>,
             amount0_0: bigint,
             amount1_0: bigint,
             depositor_0: Uint8Array,
             fee_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  addLiquidity(context: __compactRuntime.CircuitContext<PS>,
               amount0_0: bigint,
               amount1_0: bigint,
               depositor_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  removeLiquidity(context: __compactRuntime.CircuitContext<PS>,
                  lpAmount_0: bigint,
                  withdrawer_0: Uint8Array): __compactRuntime.CircuitResults<PS, [bigint,
                                                                                  bigint]>;
  swap(context: __compactRuntime.CircuitContext<PS>,
       amountIn_0: bigint,
       minOut_0: bigint,
       zeroForOne_0: boolean,
       trader_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getReserves(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, [bigint,
                                                                                                  bigint]>;
  getUserBalance(context: __compactRuntime.CircuitContext<PS>,
                 user_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getAmountOut(context: __compactRuntime.CircuitContext<PS>,
               amountIn_0: bigint,
               zeroForOne_0: boolean): __compactRuntime.CircuitResults<PS, bigint>;
  getAmountIn(context: __compactRuntime.CircuitContext<PS>,
              amountOut_0: bigint,
              zeroForOne_0: boolean): __compactRuntime.CircuitResults<PS, bigint>;
  getFeeBps(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  isInitialized(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type ProvableCircuits<PS> = {
  initialize(context: __compactRuntime.CircuitContext<PS>,
             amount0_0: bigint,
             amount1_0: bigint,
             depositor_0: Uint8Array,
             fee_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  addLiquidity(context: __compactRuntime.CircuitContext<PS>,
               amount0_0: bigint,
               amount1_0: bigint,
               depositor_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  removeLiquidity(context: __compactRuntime.CircuitContext<PS>,
                  lpAmount_0: bigint,
                  withdrawer_0: Uint8Array): __compactRuntime.CircuitResults<PS, [bigint,
                                                                                  bigint]>;
  swap(context: __compactRuntime.CircuitContext<PS>,
       amountIn_0: bigint,
       minOut_0: bigint,
       zeroForOne_0: boolean,
       trader_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getReserves(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, [bigint,
                                                                                                  bigint]>;
  getUserBalance(context: __compactRuntime.CircuitContext<PS>,
                 user_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getAmountOut(context: __compactRuntime.CircuitContext<PS>,
               amountIn_0: bigint,
               zeroForOne_0: boolean): __compactRuntime.CircuitResults<PS, bigint>;
  getAmountIn(context: __compactRuntime.CircuitContext<PS>,
              amountOut_0: bigint,
              zeroForOne_0: boolean): __compactRuntime.CircuitResults<PS, bigint>;
  getFeeBps(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  isInitialized(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  initialize(context: __compactRuntime.CircuitContext<PS>,
             amount0_0: bigint,
             amount1_0: bigint,
             depositor_0: Uint8Array,
             fee_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  addLiquidity(context: __compactRuntime.CircuitContext<PS>,
               amount0_0: bigint,
               amount1_0: bigint,
               depositor_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  removeLiquidity(context: __compactRuntime.CircuitContext<PS>,
                  lpAmount_0: bigint,
                  withdrawer_0: Uint8Array): __compactRuntime.CircuitResults<PS, [bigint,
                                                                                  bigint]>;
  swap(context: __compactRuntime.CircuitContext<PS>,
       amountIn_0: bigint,
       minOut_0: bigint,
       zeroForOne_0: boolean,
       trader_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getReserves(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, [bigint,
                                                                                                  bigint]>;
  getUserBalance(context: __compactRuntime.CircuitContext<PS>,
                 user_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getAmountOut(context: __compactRuntime.CircuitContext<PS>,
               amountIn_0: bigint,
               zeroForOne_0: boolean): __compactRuntime.CircuitResults<PS, bigint>;
  getAmountIn(context: __compactRuntime.CircuitContext<PS>,
              amountOut_0: bigint,
              zeroForOne_0: boolean): __compactRuntime.CircuitResults<PS, bigint>;
  getFeeBps(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  isInitialized(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
