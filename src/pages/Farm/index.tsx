import React, { useCallback, useContext, useMemo, useState } from 'react'
import styled, { ThemeContext } from 'styled-components'
import { Link } from 'react-router-dom'
import { SwapPoolTabs } from '../../components/NavigationTabs'

import Question from '../../components/QuestionHelper'
import Lock from '../../components/LockHelper'
import { BalanceText } from '../../components/PositionCard'
import { FarmPositionCard } from '../../components/FarmPositionCard'
import { ExternalLink, TYPE } from '../../theme'
import { Text } from 'rebass'
import { LightCard } from '../../components/Card'
import { RowBetween, RowFixed } from '../../components/Row'
import { ButtonPrimary, ButtonSecondary } from '../../components/Button'
import { AutoColumn } from '../../components/Column'

import { useActiveWeb3React } from '../../hooks'
import { useBlockNumber, useWalletModalToggle } from '../../state/application/hooks'
import { useRewardToken, useUserInfoFarmablePools } from '../../data/Reserves'
import { Dots } from '../../components/swap/styleds'

import { usePndaBalance, useMasterChefContract } from '../../hooks/useContract'
import { getEtherscanLink, shortenAddress } from '../../utils'
import { Fraction, JSBI, TokenAmount } from 'uniswap-bsc-sdk'
import { useHarvestAll } from '../../hooks/Farm'
import { useLockedEarned } from '../../data/Staked'
import { ChevronRight, Loader, Lock as LockIcon, Unlock as UnlockIcon } from 'react-feather'
import { useTokenBalancesWithLoadingIndicator } from '../../state/wallet/hooks'
import CurrencySearchModal from '../../components/SearchModal/CurrencySearchModal'
import { useSelectedListUrl } from '../../state/lists/hooks'
import { useAllFarmablePools } from '../../constants/bao'
import { PNDA } from '../../constants'
import {
	blocksPerYear,
	useAllAPYs,
	useAllNewRewardPerBlock,
	useAllPriceOracleDescriptors,
	useAllStakedTVL,
	useBaoUsdPrice,
} from '../../hooks/TVL'
import { FarmState, initialFarmState } from '../../state/farm/reducer'
import AppBody from '../AppBody'
import { PoolBody } from '../Pool'
import { usePoolProps } from '../../hooks/Pool'
import { useAllTotalSupply } from '../../data/TotalSupply'
import Input from '../../components/NumericalInput'
import { useSkipHarvestThresholdManager } from '../../state/user/hooks'

export default function Farm() {
	const theme = useContext(ThemeContext)
	const { account, chainId } = useActiveWeb3React()

	const poolProps = usePoolProps()

	// toggle wallet when disconnected
	const toggleWalletModal = useWalletModalToggle()

	const allFarmablePools = useAllFarmablePools()
	console.log("all farmable polls: ");
	console.log(allFarmablePools);
	const liquidityTokens = useMemo(() => allFarmablePools.map((farm) => farm.token), [allFarmablePools])

	const [tokenBalanceMap, fetchingV2PairBalances] = useTokenBalancesWithLoadingIndicator(
		account ?? undefined,
		liquidityTokens
	)

	const [userInfo, fetchingUserInfo] = useUserInfoFarmablePools(allFarmablePools)

	const rewardToken = useRewardToken()
	const allPendingRewards = useMemo(
		() =>
			userInfo
				.map((userInfo) => userInfo.pendingReward)
				.reduce((sum, current) => sum.add(current), new TokenAmount(rewardToken, '0')),
		[userInfo, rewardToken]
	)

	const unlockedPending = allPendingRewards?.multiply(new Fraction('1', '20'))
	const lockedPending = allPendingRewards?.multiply(new Fraction('19', '20'))
	const masterChefContract = useMasterChefContract()

	const lockedEarnedAmount = useLockedEarned()
	const unlockBlock = 15513277
	const latestBlockNumber = useBlockNumber() || unlockBlock
	const remainingBlocks = Math.max(unlockBlock - latestBlockNumber, 0)

	// redux farm state

	const [skipHarvestThreshold, setSkipHarvestThreshold] = useSkipHarvestThresholdManager()

	const onSkipThresholdInput = (input: string) => {
		setSkipHarvestThreshold(Number.parseFloat(input) || 0)
	}

	const [{ attemptingHarvest }, setFarmState] = useState<FarmState>(initialFarmState)

	const { callback } = useHarvestAll(
		useMemo(() => {
			return userInfo.filter(({ pendingReward }) =>
				pendingReward
					.multiply(new Fraction('1', '20'))
					.greaterThan(new Fraction((skipHarvestThreshold || 0).toFixed(0), '1'))
			)
		}, [userInfo, skipHarvestThreshold])
	)
	const handleHarvestAll = useCallback(() => {
		if (!callback) {
			return
		}
		setFarmState({ attemptingHarvest: true, harvestErrorMessage: undefined, harvestTxnHash: undefined })
		callback()
			.then(() => {
				setFarmState({ attemptingHarvest: false, harvestErrorMessage: undefined, harvestTxnHash: undefined })
			})
			.catch((error) => {
				setFarmState({
					attemptingHarvest: false,
					harvestErrorMessage: error.message,
					harvestTxnHash: undefined,
				})
			})
	}, [callback])

	const v2IsLoading = fetchingV2PairBalances || !account || fetchingUserInfo

	const IconWrapper = styled.div<{ pending: boolean; success?: boolean }>`
		color: ${({ pending, success, theme }) => (pending ? theme.primary1 : success ? theme.green1 : theme.red1)};
	`

	const baocxBalance = usePndaBalance()
	const baoPriceUsd = useBaoUsdPrice()

	const selectedListUrl = useSelectedListUrl()
	const noListSelected = !selectedListUrl

	const allNewRewardPerBlock = useAllNewRewardPerBlock(userInfo)

	const allPriceOracles = useAllPriceOracleDescriptors(userInfo)

	const allStakedTVLs = useAllStakedTVL(userInfo, allPriceOracles, baoPriceUsd)

	const totalSupplies = useAllTotalSupply(userInfo)

	const zero = useMemo(() => new Fraction('0', '1'), [])
	const allStakedTVL = useMemo(
		() =>
			allStakedTVLs.reduce((current, next, i) => {
				const sum = current ?? zero
				const add = next ?? zero
				const totalSupply = totalSupplies[i]
				if (!totalSupply) {
					return zero
				}
				const totalSupplyFraction = new Fraction(totalSupply.numerator, totalSupply.denominator)
				const totalSupplyRatio = totalSupplyFraction
				const yourRatioStaked = totalSupplyRatio.greaterThan('0')
					? userInfo[i].stakedAmount.divide(totalSupplyRatio)
					: zero
				return sum.add(add.multiply(yourRatioStaked))
			}, zero),
		[allStakedTVLs, userInfo, totalSupplies, zero]
	)

	const allAPYs = useAllAPYs(userInfo, baoPriceUsd, allNewRewardPerBlock, allStakedTVLs)

	const lockedBaocxBalanceUsd = useMemo(
		() => (lockedEarnedAmount ? baoPriceUsd?.multiply(lockedEarnedAmount) : undefined),
		[baoPriceUsd, lockedEarnedAmount]
	)

	const blocksToTimeEstimate = new Fraction(JSBI.BigInt(remainingBlocks), blocksPerYear).multiply(
		new Fraction('1461', '4')
	)

	return (
		<>
			<AppBody>
				<SwapPoolTabs active={'farm'} />
				<LightCard>
					<AutoColumn>
						<RowBetween>
							<RowBetween>
								<Text fontSize={16} fontWeight={500}>
									PanDuh:
								</Text>
							</RowBetween>
							<b>${baoPriceUsd ? baoPriceUsd.toSignificant(5, {}) : '-'}</b>
						</RowBetween>
						<RowBetween marginTop="12px">
							<RowFixed>
								<Text fontSize={16} fontWeight={500}>
									Locked {rewardToken.symbol}:
								</Text>
								<Question
									text={`Every time you Harvest or change your Stake, you instantly earn 5% of your pending rewards, and the remaining 95% will begin unlocking linearly at block ${unlockBlock}.`}
								/>
								<Lock text={`Linear unlock begins in: ${blocksToTimeEstimate.toFixed(2)} days`} />
							</RowFixed>
							<AutoColumn justify="end">
								{lockedEarnedAmount ? (
									<TYPE.body>
										<b>{lockedEarnedAmount.toFixed(2, {})}</b>
									</TYPE.body>
								) : (
									'-'
								)}
								{lockedBaocxBalanceUsd ? (
									<TYPE.body>
										<b>${lockedBaocxBalanceUsd.toFixed(2, {})}</b>
									</TYPE.body>
								) : (
									'-'
								)}
							</AutoColumn>
						</RowBetween>
						<RowBetween marginTop="12px">
							<Text color={theme.text1} fontWeight={500}>
								Your Staked Value:
							</Text>
							<RowFixed>
								<Text color={theme.primary1} fontWeight={900}>
									{allStakedTVL && allStakedTVL.greaterThan('0') ? allStakedTVL.toFixed(2, {}) : '-'} USD
								</Text>
							</RowFixed>
						</RowBetween>
					</AutoColumn>
				</LightCard>
				<AutoColumn gap="lg" justify="center">
					<AutoColumn gap="12px" style={{ width: '100%' }}>
						{chainId && masterChefContract && (
							<RowBetween padding={'0 8px'}>
								<AutoColumn gap="24px">
									<ExternalLink id="link" href={getEtherscanLink(chainId, masterChefContract.address, 'address')}>
										PandaMasterFarmer Contract
										<TYPE.body color={theme.text3}>
											<b title={masterChefContract.address}>{shortenAddress(masterChefContract.address)} ↗</b>
										</TYPE.body>
									</ExternalLink>

									{baocxBalance?.greaterThan('1') ? (
										<RowBetween>
											<ButtonSecondary padding="0.5rem" as={Link} to={`swap/${PNDA.address}`}>
												<Text>Swap</Text>
												<BalanceText color={theme.text1} paddingLeft={1}>
													{baocxBalance.toFixed(0, {})}
												</BalanceText>{' '}
												<Text paddingLeft={1}>{rewardToken.symbol}</Text>
												<ChevronRight />
											</ButtonSecondary>
										</RowBetween>
									) : (
										''
									)}
								</AutoColumn>

								<AutoColumn gap="6px" style={{ marginTop: '6px' }}>
									<RowBetween>
										<ButtonPrimary
											padding="0.5rem"
											onClick={() => handleHarvestAll()}
											disabled={attemptingHarvest || !account || v2IsLoading}
										>
											{attemptingHarvest ? (
												<span>
													<Dots>Harvesting</Dots>
													<IconWrapper pending={attemptingHarvest} success={!attemptingHarvest}>
														<Loader />
													</IconWrapper>
												</span>
											) : (
												<span>
													<Text color={theme.primaryText1} fontWeight={700}>
														Harvest All
													</Text>
													<BalanceText style={{ flexShrink: 0, textAlign: 'end' }} pr="0.5rem" fontWeight={500}>
														&nbsp;&nbsp;
														<UnlockIcon size="14px" /> <b>{unlockedPending?.toFixed(0) || '-'} </b>
														<span style={{ flexShrink: 1, fontSize: '8pt' }}>{rewardToken.symbol}</span>
														<br />
														+ <LockIcon size="14px" /> <b>{lockedPending?.toFixed(0) || '-'} </b>
														<span style={{ flexShrink: 1, fontSize: '8pt' }}>{rewardToken.symbol}</span>
													</BalanceText>
												</span>
											)}
										</ButtonPrimary>
									</RowBetween>
									<LightCard>
										<RowBetween>
											<Text color={theme.primary1} fontSize="8pt">
												Harvest farms with ≥:
											</Text>
										</RowBetween>
										<RowBetween>
											<Input value={skipHarvestThreshold} onUserInput={onSkipThresholdInput}></Input>
											<Text fontSize="8pt">{rewardToken.symbol ?? ''}</Text>
										</RowBetween>
									</LightCard>
								</AutoColumn>
							</RowBetween>
						)}

						<RowBetween padding={'0 8px'}>
							<Text color={theme.text1} fontWeight={500}>
								Your Staked Liquidity Pools:
							</Text>
							<Question text="After you add liquidity to a pair, you are able to stake your position to earn PNDA." />
						</RowBetween>

						{!account ? (
							<LightCard padding="40px">
								<ButtonPrimary onClick={toggleWalletModal}>Connect Wallet</ButtonPrimary>
							</LightCard>
						) : v2IsLoading ? (
							<LightCard padding="40px">
								<TYPE.body color={theme.text3} textAlign="center">
									<Dots>Loading</Dots>
								</TYPE.body>
							</LightCard>
						) : userInfo?.length > 0 ? (
							<>
								{userInfo.map((farmablePool, i) => (
									<FarmPositionCard
										key={farmablePool.address}
										farmablePool={farmablePool}
										baoPriceUsd={baoPriceUsd}
										apy={allAPYs[i]}
										allStakedTVL={allStakedTVLs[i]}
										unstakedLPAmount={tokenBalanceMap[farmablePool.address]}
										defaultShowMore={false}
									/>
								))}
							</>
						) : (
							<LightCard padding="40px">
								{noListSelected ? (
									<CurrencySearchModal
										isOpen={noListSelected}
										onCurrencySelect={() => {
											/* no-op */
										}}
										onDismiss={() => {
											/* no-op */
										}}
									/>
								) : (
									<>
										<TYPE.body color={theme.text3} textAlign="center">
											No staked liquidity found.
										</TYPE.body>
										<ButtonPrimary id="join-pool-button" as={Link} style={{ marginTop: 16 }} to="/add/ETH">
											<Text fontWeight={500} fontSize={20}>
												Add Liquidity
											</Text>
										</ButtonPrimary>
									</>
								)}
							</LightCard>
						)}
					</AutoColumn>
				</AutoColumn>
			</AppBody>
			{account && (
				<>
					<div style={{ marginBottom: '10px' }} />
					<AppBody>
						<PoolBody {...poolProps} />
					</AppBody>
				</>
			)}
		</>
	)
}
