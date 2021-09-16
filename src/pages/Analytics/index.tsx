import React, { RefObject, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { ThemeContext } from 'styled-components'
import { SwapPoolTabs } from '../../components/NavigationTabs'

import Question from '../../components/QuestionHelper'
import { TYPE } from '../../theme'
import { Text } from 'rebass'
import { LightCard } from '../../components/Card'
import { RowBetween, RowFixed } from '../../components/Row'
import { AutoColumn } from '../../components/Column'
import { SearchInput } from './styleds'

import { useActiveWeb3React } from '../../hooks'
import { Dots } from '../../components/swap/styleds'
import { useAllFarmablePools } from '../../constants/bao'
import { FarmAnalyticsCard } from '../../components/FarmAnalyticsCard'
import { usePoolInfoFarmablePools } from '../../data/Reserves'
import { useTranslation } from 'react-i18next'
import {
	useAllAPYs,
	useAllNewRewardPerBlock,
	useAllPriceOracleDescriptors,
	useAllStakedTVL,
	useBaoUsdPrice,
} from '../../hooks/TVL'
import AppBody from '../AppBody'
import useDebounce from '../../hooks/useDebounce'
import Toggle from '../../components/Toggle'
import { useSortByAPYManager } from '../../state/user/hooks'
import { Option } from '../../components/RadioButton'
import Logo from '../../components/Logo'
import { Fraction } from 'uniswap-bsc-sdk'

export default function Analytics() {
	console.log("starting analytics");
	const { t } = useTranslation()
	const theme = useContext(ThemeContext)
	const { active } = useActiveWeb3React()

	const allFarmablePools = useAllFarmablePools()
	const allNewRewardPerBlock = useAllNewRewardPerBlock(allFarmablePools)
	const [poolInfo, fetchingPoolInfo] = usePoolInfoFarmablePools(allFarmablePools, allNewRewardPerBlock)

	const [searchQuery, setSearchQuery] = useState('')
	const [filterPoolType, setFilterPoolType] = useState<'all' | 'pancake' | 'panda'>('all')

	const query = useDebounce(
		useMemo(() => searchQuery.toLowerCase(), [searchQuery]),
		200
	)

	// manage focus on modal show
	const inputRef = useRef<HTMLInputElement>()
	const handleInput = useCallback((event) => {
		const input = event.target.value
		setSearchQuery(input)
	}, [])

	const handleFilterPoolType = (filterPoolType: 'all' | 'pancake' | 'panda') => {
		setFilterPoolType(filterPoolType)
	}

	const [sortByAPY, toggleSortByAPY] = useSortByAPYManager()

	const baoPriceUsd = useBaoUsdPrice()

	const allPriceOracles = useAllPriceOracleDescriptors(poolInfo)

	const allStakedTVLs = useAllStakedTVL(poolInfo, allPriceOracles, baoPriceUsd)

	const allStakedTVL = useMemo(
		() =>
			allStakedTVLs.reduce(
				(current, next) => current?.add(next ?? new Fraction('0', '1')) ?? new Fraction('0', '1'),
				new Fraction('0', '1')
			),
		[allStakedTVLs]
	)

	const allAPYs = useAllAPYs(poolInfo, baoPriceUsd, allNewRewardPerBlock, allStakedTVLs)

	const sortedAndFilteredPools = useMemo(() => {
		const combined = poolInfo.map((farm, i) => {
			return {
				...farm,
				apy: allAPYs[i],
				tvl: allStakedTVLs[i],
			}
		})

		const filteredPools = combined.filter((farm) => {
			const nameOrSymbolMatches =
				farm.symbol.split(' ')[0].toLowerCase().includes(query) || farm.name.toLowerCase().includes(query)
			const poolTypeMatches =
				filterPoolType === 'all' ? true : filterPoolType === 'pancake' ? farm.isSushi : !farm.isSushi
			return nameOrSymbolMatches && poolTypeMatches
		})

		if (sortByAPY) {
			return filteredPools.sort(({ apy: apy0 }, { apy: apy1 }) => {
				if (!apy0 && !apy1) {
					return 0
				} else if (!apy0) {
					return 1
				} else if (!apy1) {
					return -1
				} else {
					return apy0.greaterThan(apy1) ? -1 : apy0.equalTo(apy1) ? 0 : 1
				}
			})
		}
		return combined
	}, [poolInfo, sortByAPY, allAPYs, allStakedTVLs, query, filterPoolType])

	const isLoading = fetchingPoolInfo

	return (
		<AppBody>
			<SwapPoolTabs active={'analytics'} />
			<AutoColumn gap="lg" justify="center">
				<AutoColumn gap="12px" style={{ width: '100%' }}>
					<RowBetween padding={'0 8px'}>
						<Text color={theme.text1} fontWeight={500}>
							Farmable Pool Analytics
						</Text>
						<Question text="Analytics about all farmable pools" />
					</RowBetween>
					<SearchInput
						type="text"
						id="pool-search-input"
						placeholder={t('poolSearchPlaceholder')}
						value={searchQuery}
						ref={inputRef as RefObject<HTMLInputElement>}
						onChange={handleInput}
						disabled={fetchingPoolInfo}
					/>
					<RowBetween padding={'0 8px'}>
						Sort by APY (high to low):
						<RowFixed>
							<Toggle isActive={sortByAPY} toggle={toggleSortByAPY} />
						</RowFixed>
					</RowBetween>
					<RowBetween padding={'0 8px'}>
						Filter Pool Type:
						<RowFixed>
							<Option
								onClick={() => {
									handleFilterPoolType('all')
								}}
								active={filterPoolType === 'all'}
							>
								<span role="img" aria-label="ALL">
									🥞🐼
								</span>{' '}
								ALL
							</Option>
							<Option
								onClick={() => {
									handleFilterPoolType('pancake')
								}}
								active={filterPoolType === 'pancake'}
							>
								<span role="img" aria-label="SLP">
									🥞
								</span>{' '}
								CAKELP
							</Option>
							<Option
								onClick={() => {
									handleFilterPoolType('panda')
								}}
								active={filterPoolType === 'panda'}
							>
								<Logo
									srcs={[`images/pnda-logo.png`]}
									alt="PNDA-LP"
									style={{ width: 16, height: 16, objectFit: 'contain', margin: 4 }}
								/>
							</Option>
						</RowFixed>
					</RowBetween>
					<RowBetween padding={'0 8px'}>
						<div></div>
						<RowFixed>
							<Text color={theme.text1} fontWeight={500} fontSize={18} paddingRight={1}>
								TVL
							</Text>
							<Text color={theme.primary1} fontWeight={900} fontSize={18}>
								{allStakedTVL && allStakedTVL.greaterThan('0') ? allStakedTVL.toFixed(2, {}) : '-'} USD
							</Text>
						</RowFixed>
						<div></div>
					</RowBetween>
					{!active ? (
						<LightCard padding="40px">
							<TYPE.body color={theme.text3} textAlign="center">
								Connect to a wallet to view farmable pools.
							</TYPE.body>
						</LightCard>
					) : isLoading ? (
						<LightCard padding="40px">
							<TYPE.body color={theme.text3} textAlign="center">
								<Dots>Loading</Dots>
							</TYPE.body>
						</LightCard>
					) : sortedAndFilteredPools.length > 0 ? (
						<>
							{sortedAndFilteredPools.map((farm) => (
								<FarmAnalyticsCard
									key={`analytics-${farm.address}`}
									farmablePool={farm}
									apy={farm.apy}
									tvl={farm.tvl}
									defaultShowMore={false}
								/>
							))}
						</>
					) : (
						<LightCard padding="40px">
							<TYPE.body color={theme.text3} textAlign="center">
								No unstaked liquidity found.
							</TYPE.body>
						</LightCard>
					)}
				</AutoColumn>
			</AutoColumn>
		</AppBody>
	)
}
