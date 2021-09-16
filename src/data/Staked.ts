import { Fraction, Token, TokenAmount } from 'uniswap-bsc-sdk'
import { Contract } from '@ethersproject/contracts'

import { useMemo } from 'react'

import { useBaoContract, useLPContract, useMasterChefContract, useWETHContract } from '../hooks/useContract'
import { useMultipleContractSingleData, useSingleCallResult } from '../state/multicall/hooks'
import { FarmablePool } from '../constants/bao'
import { XDAI_WETH } from '../constants'
import { useActiveWeb3React } from '../hooks'
import { useRewardToken } from './Reserves'
import { Interface } from '@ethersproject/abi'
import { ERC20_ABI } from '../constants/abis/erc20'

export function useTotalLiquidityAmount(token?: Token, contract?: Contract): TokenAmount | undefined {
  const balance = useSingleCallResult(contract, 'balanceOf', [contract?.address]).result?.[0]

  return useMemo(() => (contract && token && balance ? new TokenAmount(token, balance?.toString()) : undefined), [
    token,
    balance,
    contract,
  ])
}

export function useStakedAmount(token: Token | undefined): TokenAmount | undefined {
  console.log("about to calc useStakedAmount for: ");
  console.log(token);

  const masterChefContract = useMasterChefContract()
  console.log("masterChefContract: ");
  console.log(masterChefContract);
  const contract = useLPContract(token?.address) || null
  console.log("contract: ");
  console.log(contract);

  const balance = useSingleCallResult(contract, 'balanceOf', [masterChefContract?.address]).result?.[0]
  console.log("balance: ");
  console.log(balance);
  return useMemo(() => (contract && token && balance ? new TokenAmount(token, balance?.toString()) : undefined), [
    token,
    balance,
    contract,
  ])
}

const ERC20_INTERFACE = new Interface(ERC20_ABI)
export function useAllStakedAmounts(tokens: Token[] | undefined): (TokenAmount | undefined)[] {
  const masterChefContract = useMasterChefContract()
  console.log(masterChefContract);
  const tokenAddresses = useMemo(() => tokens?.map((t) => t?.address), [tokens])
  console.log("tokenAddresses: ");
  console.log(tokenAddresses);
  // const contracts = useLPContracts(tokenAddresses ?? []) || null
  const balanceResults = useMultipleContractSingleData(tokenAddresses ?? [], ERC20_INTERFACE, 'balanceOf', [
    masterChefContract?.address,
  ])
  console.log("useAllStakedAmounts balance results: ");
  console.log(balanceResults);
  console.log("tokens: ");
  console.log(tokens);
  return useMemo(() => {
    console.log("about to map balanceResults");
    return balanceResults?.map((balanceResult, i) => {
      const token = tokens && tokens[i]
      const balance = balanceResult.result?.[0]
      return token && balance ? new TokenAmount(token, balance?.toString()) : undefined
    })
  }, [balanceResults, tokens])
}

export function useUserStakedBalance(lpToken?: Token, farmablePool?: FarmablePool): TokenAmount | undefined {
  const masterChefContract = useMasterChefContract()
  const { account } = useActiveWeb3React()
  const userStakedBalance = useSingleCallResult(masterChefContract, 'userInfo', [
    farmablePool?.pid ?? undefined,
    account ?? undefined,
  ]).result?.[0]

  return useMemo(
    () =>
      lpToken && farmablePool && userStakedBalance
        ? new TokenAmount(lpToken, userStakedBalance?.toString())
        : undefined,
    [lpToken, farmablePool, userStakedBalance]
  )
}

// see: useTotalSupply(token?:)

export function usePoolWeightFraction(farmablePool?: FarmablePool): Fraction | undefined {
  const masterChefContract = useMasterChefContract()
  const allocPoint: string = useSingleCallResult(masterChefContract, 'poolInfo', [farmablePool?.pid]).result?.[1]
  const totalAllocPoint: string = useSingleCallResult(masterChefContract, 'totalAllocPoint').result?.[0]

  return useMemo(() => (allocPoint && totalAllocPoint ? new Fraction(allocPoint, totalAllocPoint) : undefined), [
    allocPoint,
    totalAllocPoint,
  ])
}

export function useContractWETHBalance(contract?: Contract): TokenAmount | undefined {
  const wethContract = useWETHContract() // native wrapped chain currency
  const wethBalance = useSingleCallResult(wethContract, 'balanceOf', [contract?.address]).result?.[0]
  const tokenAddress = contract?.address

  return useMemo(
    () => (tokenAddress && wethBalance ? new TokenAmount(XDAI_WETH, wethBalance?.toString()) : undefined),
    [tokenAddress, wethBalance]
  )
}

export function useLockedEarned(): TokenAmount | undefined {
  const rewardToken = useRewardToken()
  const { account } = useActiveWeb3React()
  const baoContract = useBaoContract()

  const result = useSingleCallResult(baoContract, 'lockOf', [account ?? undefined]).result?.[0]

  return useMemo(() => (result ? new TokenAmount(rewardToken, result) : undefined), [rewardToken, result])
}
