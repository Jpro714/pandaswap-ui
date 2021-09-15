import { useMemo } from 'react'
import { ChainId, Fraction, JSBI, Token, TokenAmount, WETH } from 'uniswap-bsc-sdk'
import { useActiveWeb3React } from '.'
import { FarmablePool, priceOracles } from '../constants/bao'
import { usePair, usePairs, usePancakePairs, useRewardToken } from '../data/Reserves'
import {
  useMultipleContractSingleData,
  useSingleCallResult,
  useSingleContractMultipleData,
} from '../state/multicall/hooks'
import { useMasterChefContract } from './useContract'
import { BUSD, DAI, ETH, PNDA, USDC } from '../constants'
import { BigNumber } from '@ethersproject/bignumber'
import { useAllTotalSupply } from '../data/TotalSupply'
import { useAllStakedAmounts } from '../data/Staked'
import { CHAINLINK_PRICE_ORACLE_INTERFACE, usePriceOracleContract } from '../constants/abis/Chainlink'
import { Token as PancakeToken } from '@pancakeswap-libs/sdk-v2'
export const blocksPerYear = JSBI.BigInt(10519200) // (31556952 = (seconds / year)) / (3 second/block) = 10518984.4

const ten = JSBI.BigInt(10)

export const useBaoUsdPrice = (): Fraction | undefined => {
  // PNDA-BNB
  const XDAI = WETH[137]
  const [, pair1] = usePair(PNDA, XDAI)
  const xDaiUsdOracleAddress = useMemo(() => priceOracles[137][XDAI.address], [XDAI.address])

  // PNDA-USDC
  const [, pair2] = usePair(PNDA, USDC)
  const wethUsdOracleAddress = useMemo(() => priceOracles[137][USDC.address], [])

  // PNDA-BUSD
  const [, pair3] = usePair(PNDA, BUSD)
  const busdUsdOracleAddress = useMemo(() => priceOracles[137][BUSD.address], [])

  // PNDA-DAI
  const [, pair4] = usePair(PNDA, DAI)
  const daiUsdOracleAddress = useMemo(() => priceOracles[137][DAI.address], [])

  const [, pair5] = usePair(PNDA, ETH)
  const ethUsdOracleAddress = useMemo(() => priceOracles[137][ETH.address], [])

  const allPriceOracles = [
    xDaiUsdOracleAddress,
    wethUsdOracleAddress,
    busdUsdOracleAddress,
    daiUsdOracleAddress,
    ethUsdOracleAddress,
  ]

  const allPairs = useMemo(() => [pair1, pair2, pair3, pair4, pair5], [pair1, pair2, pair3, pair4, pair5])

  const priceRawResults = useMultipleContractSingleData(
    allPriceOracles,
    CHAINLINK_PRICE_ORACLE_INTERFACE,
    'latestRoundData',
    []
  )
  const decimalsResults = useMultipleContractSingleData(
    allPriceOracles,
    CHAINLINK_PRICE_ORACLE_INTERFACE,
    'decimals',
    []
  )

  return useMemo(() => {
    const allPrices = allPairs.map((pair, i) => {
      if (!pair) {
        return undefined
      }
      const priceOfBao = pair.priceOf(PNDA)
      const priceRaw: BigNumber | undefined = priceRawResults[i].result?.[1]
      const decimals: number | undefined = decimalsResults[i].result?.[0]
      const decimated = decimals ? JSBI.exponentiate(ten, JSBI.BigInt(decimals)) : undefined
      const chainFraction = priceRaw && decimated ? new Fraction(JSBI.BigInt(priceRaw), decimated) : undefined
      return chainFraction ? chainFraction.multiply(priceOfBao) : undefined
    })

    const validPrices = allPrices.flatMap((p) => (p instanceof Fraction ? [p] : []))
    const averagePrice = validPrices
      .reduce((sum, current) => sum.add(current), new Fraction(JSBI.BigInt(0)))
      .divide(JSBI.BigInt(validPrices.length))

    return averagePrice
  }, [allPairs, decimalsResults, priceRawResults])
}

export interface PriceOracleDescriptor {
  token0: Token | undefined
  token1: Token | undefined
  priceOracleBaseToken: Token | undefined
  isUsingBaoUsdPrice: boolean
  priceOracleAddress: string | undefined
}

export function useAllPriceOracleDescriptors(farmablePools: FarmablePool[]): PriceOracleDescriptor[] {
  const { chainId } = useActiveWeb3React()
  const chainIdNumber = useMemo(() => (chainId === ChainId.XDAI ? 137 : undefined), [chainId])

  const tokenDesciptorPairs = useMemo(() => farmablePools.map((f) => f.tokenAddresses), [farmablePools])
  const priceOraclesForChain = useMemo(() => chainIdNumber && priceOracles[chainIdNumber], [chainIdNumber])

  const tokensAndBaseToken = useMemo(() => {
    return tokenDesciptorPairs.map((tokenDescriptorPair) => {
      const [tokenDescriptor0, tokenDescriptor1] = tokenDescriptorPair

      const token0 =
        chainId && new Token(chainId, tokenDescriptor0.address, tokenDescriptor0.decimals, tokenDescriptor0.symbol)
      const token1 =
        chainId && new Token(chainId, tokenDescriptor1.address, tokenDescriptor1.decimals, tokenDescriptor1.symbol)

      const denomination = (): { priceOracleBaseToken: Token | undefined; priceOracleAddress: string | undefined } => {
        if (!priceOraclesForChain || !token0 || !token1) {
          return { priceOracleBaseToken: undefined, priceOracleAddress: undefined }
        }
        const token0Oracle = priceOraclesForChain[tokenDescriptor0.address]
        const token1Oracle = priceOraclesForChain[tokenDescriptor1.address]

        if (token0Oracle && token0Oracle.startsWith('0x')) {
          return { priceOracleBaseToken: token0, priceOracleAddress: token0Oracle }
        } else if (token1Oracle && token1Oracle.startsWith('0x')) {
          return { priceOracleBaseToken: token1, priceOracleAddress: token1Oracle }
        } else if (token0Oracle) {
          return { priceOracleBaseToken: token0, priceOracleAddress: token0Oracle }
        } else if (token1Oracle) {
          return { priceOracleBaseToken: token1, priceOracleAddress: token1Oracle }
        } else {
          return { priceOracleBaseToken: undefined, priceOracleAddress: undefined }
        }
      }

      const { priceOracleBaseToken, priceOracleAddress } = denomination()

      const isUsingBaoUsdPrice = !priceOracleAddress || !priceOracleAddress.startsWith('0x')

      return {
        token0,
        token1,
        priceOracleBaseToken,
        priceOracleAddress,
        isUsingBaoUsdPrice,
      }
    })
  }, [chainId, priceOraclesForChain, tokenDesciptorPairs])

  return useMemo(() => {
    return tokensAndBaseToken.map((pod) => {
      return pod
    })
  }, [tokensAndBaseToken])
}

export function useAllStakedTVL(
  farmablePools: FarmablePool[],
  priceOracleDescriptors: PriceOracleDescriptor[],
  baoPriceUsd: Fraction | undefined | null
): (Fraction | undefined)[] {
  const tokens = useMemo(() => farmablePools.map((f) => f.token), [farmablePools])
  const totalSupplies = useAllTotalSupply(farmablePools)

  const priceOracleAddresses = useMemo(
    () => priceOracleDescriptors.map((pod) => (!pod.isUsingBaoUsdPrice ? pod.priceOracleAddress : undefined)),
    [priceOracleDescriptors]
  )

  const rawPriceResults = useMultipleContractSingleData(
    priceOracleAddresses,
    CHAINLINK_PRICE_ORACLE_INTERFACE,
    'latestRoundData'
  )
  const decimalsResults = useMultipleContractSingleData(
    priceOracleAddresses,
    CHAINLINK_PRICE_ORACLE_INTERFACE,
    'decimals'
  )

  const stakedAmounts = useAllStakedAmounts(tokens)

  const ratiosStaked = useMemo(() => {
    return stakedAmounts.map((stakedAmount, i) => {
      const totalSupply = totalSupplies[i]
      return totalSupply ? stakedAmount?.divide(totalSupply) : undefined
    })
  }, [stakedAmounts, totalSupplies])

  const tokenPairs: [Token | undefined, Token | undefined][] = useMemo(
    () => priceOracleDescriptors.map((pod): [Token | undefined, Token | undefined] => [pod.token0, pod.token1]),
    [priceOracleDescriptors]
  )
  const pancakeTokenPairs: [PancakeToken | undefined, PancakeToken | undefined][] = useMemo(
    () =>
      priceOracleDescriptors.map((pod): [PancakeToken | undefined, PancakeToken | undefined] => [
        pod.token0
          ? new PancakeToken(pod.token0.chainId.valueOf(), pod.token0.address, pod.token0.decimals)
          : undefined,
        pod.token1
          ? new PancakeToken(pod.token1.chainId.valueOf(), pod.token1.address, pod.token1.decimals)
          : undefined,
      ]),
    [priceOracleDescriptors]
  )
  const pairs = usePairs(tokenPairs)
  const pancakePairs = usePancakePairs(pancakeTokenPairs)

  return useMemo(() => {
    return priceOracleDescriptors.map((pod, i) => {
      const { priceOracleBaseToken, isUsingBaoUsdPrice } = pod
      const pancakePriceOracleBaseToken = priceOracleBaseToken
        ? new PancakeToken(
            priceOracleBaseToken.chainId.valueOf(),
            priceOracleBaseToken.address,
            priceOracleBaseToken.decimals
          )
        : undefined
      const [token0, token1] = tokenPairs[i]
      const isSingleSided = token0?.address === token1?.address
      const ratioStaked = ratiosStaked[i]
      const [, pair] = pairs[i]
      const [, pancakePair] = pancakePairs[i]
      const isSushi = farmablePools[i].isSushi
      const stakedAmount = stakedAmounts[i]

      const reserveToken = !isUsingBaoUsdPrice && priceOracleBaseToken ? priceOracleBaseToken : PNDA
      const pancakeReserveToken = pancakePriceOracleBaseToken

      const pricedInReserve = isSingleSided
        ? stakedAmount
        : isSushi && pancakePair && pancakeReserveToken
        ? pancakePair?.reserveOf(pancakeReserveToken)
        : pair?.reserveOf(reserveToken)

      const pricedInReserveFraction =
        pricedInReserve && new Fraction(pricedInReserve.numerator, pricedInReserve.denominator)

      const priceRaw: string | undefined = rawPriceResults[i].result?.[1]
      const decimals: string | undefined = decimalsResults[i].result?.[0]

      const decimated = decimals ? JSBI.exponentiate(ten, JSBI.BigInt(decimals.toString())) : undefined
      const fetchedPriceInUsd = isUsingBaoUsdPrice ? baoPriceUsd : undefined

      const chainFraction = priceRaw && decimated ? new Fraction(JSBI.BigInt(priceRaw), decimated) : undefined
      const priceInUsd = fetchedPriceInUsd ? fetchedPriceInUsd : chainFraction
      // console.log(priceOracleBaseToken?.symbol, 'pricedInUsd: ', priceInUsd?.toSignificant(8))
      const tvl =
        priceInUsd &&
        pricedInReserveFraction &&
        priceInUsd.multiply(pricedInReserveFraction).multiply(isSingleSided ? '1' : '2')
      const stakedTVL = tvl ? (isSingleSided ? tvl : ratioStaked?.multiply(tvl)) : undefined
      return tvl?.greaterThan('1') ? stakedTVL : undefined
    })
  }, [
    priceOracleDescriptors,
    tokenPairs,
    ratiosStaked,
    pairs,
    pancakePairs,
    farmablePools,
    stakedAmounts,
    rawPriceResults,
    decimalsResults,
    baoPriceUsd,
  ])
}

export function useStakedTVL(
  farmablePool: FarmablePool,
  stakedAmount: TokenAmount | undefined,
  totalSupply: TokenAmount | undefined,
  baoPriceUsd: Fraction | undefined | null
): Fraction | undefined {
  const { chainId } = useActiveWeb3React()

  const [tokenDescriptor0, tokenDescriptor1] = farmablePool.tokenAddresses
  const chainIdNumber = useMemo(() => (chainId === ChainId.XDAI ? 137 : undefined), [chainId])
  const token0 = useMemo(
    () => chainId && new Token(chainId, tokenDescriptor0.address, tokenDescriptor0.decimals, tokenDescriptor0.symbol),
    [chainId, tokenDescriptor0]
  )
  const token1 = useMemo(
    () => chainId && new Token(chainId, tokenDescriptor1.address, tokenDescriptor1.decimals, tokenDescriptor1.symbol),
    [chainId, tokenDescriptor1]
  )

  const ratioStaked = useMemo(() => (totalSupply ? stakedAmount?.divide(totalSupply) : undefined), [
    totalSupply,
    stakedAmount,
  ])

  const priceOraclesForChain = useMemo(() => chainIdNumber && priceOracles[chainIdNumber], [chainIdNumber])

  const { priceOracleBaseToken, priceOracleAddress } = useMemo(() => {
    if (!priceOraclesForChain || !token0 || !token1) {
      return { priceOracleToken: undefined, priceOracleAddress: undefined }
    }
    const token0Oracle = priceOraclesForChain[tokenDescriptor0.address]
    const token1Oracle = priceOraclesForChain[tokenDescriptor1.address]

    if (token0Oracle && token0Oracle.startsWith('0x')) {
      return { priceOracleBaseToken: token0, priceOracleAddress: token0Oracle }
    } else if (token1Oracle && token1Oracle.startsWith('0x')) {
      return { priceOracleBaseToken: token1, priceOracleAddress: token1Oracle }
    } else if (token0Oracle) {
      return { priceOracleBaseToken: token0, priceOracleAddress: token0Oracle }
    } else if (token1Oracle) {
      return { priceOracleBaseToken: token1, priceOracleAddress: token1Oracle }
    } else {
      return { priceOracleBaseToken: undefined, priceOracleAddress: undefined }
    }
  }, [priceOraclesForChain, tokenDescriptor0, tokenDescriptor1, token0, token1])

  const isUsingBaoUsdPrice = useMemo(() => !priceOracleAddress || !priceOracleAddress?.startsWith('0x'), [
    priceOracleAddress,
  ])

  const [, pair] = usePair(token0, token1)
  const pricedInReserve = useMemo(() => {
    if (!priceOracleBaseToken) {
      return null
    }
    const usingReserve = pair?.reserveOf(!isUsingBaoUsdPrice ? priceOracleBaseToken : PNDA)
    return usingReserve
  }, [priceOracleBaseToken, pair, isUsingBaoUsdPrice])

  const priceOracleContract = usePriceOracleContract(!isUsingBaoUsdPrice ? priceOracleAddress : undefined)

  const priceRaw: string | undefined = useSingleCallResult(priceOracleContract, 'latestRoundData').result?.[1]
  const decimals: string | undefined = useSingleCallResult(priceOracleContract, 'decimals').result?.[0]

  return useMemo(() => {
    const decimated = decimals ? JSBI.exponentiate(ten, JSBI.BigInt(decimals.toString())) : undefined
    const fetchedPriceInUsd = isUsingBaoUsdPrice ? baoPriceUsd?.divide(JSBI.BigInt(10)) : undefined

    const chainFraction = priceRaw && decimated ? new Fraction(JSBI.BigInt(priceRaw), decimated) : undefined
    const priceInUsd = fetchedPriceInUsd ? fetchedPriceInUsd : chainFraction
    const tvl = priceInUsd && pricedInReserve && priceInUsd.multiply(pricedInReserve).multiply('2')
    const stakedTVL = tvl ? ratioStaked?.multiply(tvl) : undefined
    return stakedTVL
  }, [decimals, isUsingBaoUsdPrice, baoPriceUsd, priceRaw, pricedInReserve, ratioStaked])
}

export const useAllNewRewardPerBlock = (farmablePools: FarmablePool[]): JSBI[] => {
  const masterChef = useMasterChefContract()
  const pids = useMemo(() => farmablePools.map((f) => [f.pid + 1]), [farmablePools])

  const rewardPerBlockResults = useSingleContractMultipleData(masterChef, 'getNewRewardPerBlock', pids)

  return useMemo(() => {
    return rewardPerBlockResults.map((r) => {
      const result: BigNumber | undefined = r.result?.[0]
      return JSBI.BigInt(result?.toString() ?? '0')
    })
  }, [rewardPerBlockResults])
}

// ((bao_price_usd * bao_per_block * blocks_per_year * pool_weight) / (total_pool_value_usd)) * 100.0
export function useAPY(
  farmablePool: FarmablePool | undefined,
  baoPriceUsd: Fraction | undefined | null,
  newRewardPerBlock: JSBI | undefined,
  tvlUsd: Fraction | undefined
): Fraction | undefined {
  const rewardToken = useRewardToken()

  return useMemo(() => {
    if (!baoPriceUsd || !tvlUsd || !tvlUsd.greaterThan('0') || !newRewardPerBlock) {
      return undefined
    }

    const decimated = JSBI.exponentiate(ten, JSBI.BigInt((rewardToken.decimals - 1).toString()))

    const rewardPerBlock = new Fraction(newRewardPerBlock, decimated)

    return tvlUsd && baoPriceUsd.multiply(rewardPerBlock).multiply(blocksPerYear).divide(tvlUsd)
  }, [newRewardPerBlock, baoPriceUsd, rewardToken.decimals, tvlUsd])
}

// ((bao_price_usd * bao_per_block * blocks_per_year * pool_weight) / (total_pool_value_usd)) * 100.0
export function useAllAPYs(
  poolInfoFarmablePools: (FarmablePool | undefined)[],
  baoPriceUsd: Fraction | undefined | null,
  newRewardPerBlocks: (JSBI | undefined)[],
  tvlUsds: (Fraction | undefined)[]
): (Fraction | undefined)[] {
  const rewardToken = useRewardToken()

  return useMemo(() => {
    return poolInfoFarmablePools.map((_, i) => {
      const tvlUsd = tvlUsds[i]
      const newRewardPerBlock = newRewardPerBlocks[i]
      if (!baoPriceUsd || !tvlUsd || !tvlUsd.greaterThan('0') || !newRewardPerBlock) {
        return undefined
      }

      const decimated = JSBI.exponentiate(ten, JSBI.BigInt((rewardToken.decimals - 1).toString()))

      const rewardPerBlock = new Fraction(newRewardPerBlock, decimated)

      return tvlUsd && baoPriceUsd.multiply(rewardPerBlock).multiply(blocksPerYear).divide(tvlUsd).multiply('10')
    })
  }, [poolInfoFarmablePools, tvlUsds, newRewardPerBlocks, baoPriceUsd, rewardToken.decimals])
}
