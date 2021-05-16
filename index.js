const Axios = require('axios').default
const chalk = require('chalk');

/**
 * Fetch transactions which has `Swap` event from given chainId and wallet address.
 * Note: Supported only Ethereum (ChainId: 1) and Binance Smart Chain (ChainId: 56).
 * @param {string} chainId
 * @param {string} address
 * @returns an array with transaction details object
 */
async function getSwapTransactions(chainId, address) {
  // Define native token symbol for given chain
  let nativeTokenSymbol;
  switch (chainId) {
    case '1':
      nativeTokenSymbol = 'ETH'
      break;
    case '56':
      nativeTokenSymbol = 'BNB'
      break;
    case '137':
      nativeTokenSymbol = 'MATIC'
      break;
    case '43114':
      nativeTokenSymbol = 'AVAX'
      break;
    case '250':
      nativeTokenSymbol = 'FTM'
      break;
    default:
      nativeTokenSymbol = 'Native Token'
  }
  // Covalent API returns a lower-case address. We have to make sure user-input address is also lowered case.
  const _address = address.toLowerCase()

  // Step 1: Fetches token details for given wallet address and cache token details
  const _balances = await Axios.get(`https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/`).then(result => result.data.data.items)

  // Cache token balance
  const _cacheBalanceTokens = []
  for (const balance of _balances) {
    _cacheBalanceTokens[balance.contract_address] = balance
  }

  // Step 2: Fetches transaction history from given chainId and address
  const _transactions = await Axios.get(`https://api.covalenthq.com/v1/${chainId}/address/${address}/transactions_v2/`, {
    params: {
      'page-size': 100 // Number of transactions per page
    }
  })
    .then(result => result.data.data.items)

  // Step 3: Filtering transactions in the following cases:
  // 1. Swap event doesn't exist
  // 2. If transaction value = 0, then make sure there's transfer event from sender
  // 3. If transaction value != 0, then make sure there's transfer event to sender
  const _swapTransactions = _transactions.filter(({ log_events, value }) => {
    const events = log_events
      .filter(({ decoded }) => decoded)
      .map(({ decoded }) => decoded)

    const eventNames = events
      .map(({ name }) => name)

    // If there's mint function, it means that this transaction is providing the liquidity, not swap transaction which we want.
    if (eventNames.indexOf("Mint") !== -1) return false
    if (eventNames.indexOf("Swap") !== -1) {
      const transferEvents = events.filter(({ name }) => name === "Transfer")
      if (value === '0') {
        return transferEvents.find(({ params }) => params[0].value === _address)
      } else {
        return transferEvents.find(({ params }) => params[1].value === _address)
      }
    }
  })

  // Step 4: Sanitize and format return data
  const swapTransactions = _swapTransactions.map(transaction => {
    const {
      fromTokenAmount,
      fromTokenDecimal,
      fromTokenSymbol,
      toTokenAmount,
      toTokenDecimal,
      toTokenSymbol,
      txHash
    } = getTransferEventParams({ tokens: _cacheBalanceTokens, transaction, nativeTokenSymbol, address: _address })

    return `${chalk.yellowBright('Swapped')} ${chalk.blueBright(fromTokenAmount / (10 ** fromTokenDecimal))} ${chalk.greenBright(fromTokenSymbol)} -> ${chalk.blueBright(toTokenAmount / (10 ** toTokenDecimal))} ${chalk.greenBright(toTokenSymbol)} (${txHash})`
  })

  for (const swapTx of swapTransactions) {
    console.log(swapTx)
  }
}


function getTransferEventParams({ tokens, transaction, nativeTokenSymbol, address }) {
  const transferEvents = transaction.log_events
    .filter(({ decoded }) => decoded && decoded.name === 'Transfer')

  const transferSentEvents = transferEvents
    .filter(({ decoded }) => decoded.params[0].value === address)
    .map(({ sender_address, decoded }) => ({
      token: sender_address,
      value: decoded.params[2].value
    }))

  const _transferReceiveErc20Event = transferEvents
    .find(({ decoded }) => decoded.params[1].value === address)

  let transferReceiveErc20Event;
  if (_transferReceiveErc20Event) {
    transferReceiveErc20Event = {
      token: _transferReceiveErc20Event.sender_address,
      value: _transferReceiveErc20Event.decoded.params[2].value
    }
  }

  const _transferReceiveEthEvent = transaction.log_events.find(({ decoded }) => {
    return decoded && decoded.name === 'Withdrawal'
  })

  let transferReceiveEthEvent;
  if (_transferReceiveEthEvent) {
    transferReceiveEthEvent = {
      token: 'ETH',
      value: _transferReceiveEthEvent.decoded.params[1].value
    }
  }

  // Use ERC20 to swap
  if (transaction.value === "0") {
    // For some tokens, it has fee or burn mechanism for every transfers.
    // In this case, we will support it by aggregates the value of every transfer that being sent from the given address.
    const sentEvent = transferSentEvents.reduce((acc, sentEvent) => ({ ...acc, value: parseInt(acc.value) + parseInt(sentEvent.value) }))

    // Swap ERC20 to ERC20
    if (transferReceiveErc20Event) {
      return {
        txHash: transaction.tx_hash,
        fromTokenSymbol: tokens[sentEvent.token].contract_ticker_symbol,
        fromTokenAmount: sentEvent.value,
        fromTokenDecimal: tokens[sentEvent.token].contract_decimals,
        toTokenSymbol: tokens[transferReceiveErc20Event.token].contract_ticker_symbol,
        toTokenAmount: transferReceiveErc20Event.value,
        toTokenDecimal: tokens[transferReceiveErc20Event.token].contract_decimals,
      }
    } else {
      // Swap ERC20 to ETH
      return {
        txHash: transaction.tx_hash,
        fromTokenSymbol: tokens[sentEvent.token].contract_ticker_symbol,
        fromTokenAmount: sentEvent.value,
        fromTokenDecimal: tokens[sentEvent.token].contract_decimals,
        toTokenSymbol: nativeTokenSymbol,
        toTokenAmount: transferReceiveEthEvent.value,
        toTokenDecimal: 18,
      }
    }
  } else {
    // Swap ETH to ERC20
    return {
      txHash: transaction.tx_hash,
      fromTokenSymbol: nativeTokenSymbol,
      fromTokenAmount: transaction.value,
      fromTokenDecimal: 18,
      toTokenSymbol: tokens[transferReceiveErc20Event.token].contract_ticker_symbol,
      toTokenAmount: transferReceiveErc20Event.value,
      toTokenDecimal: tokens[transferReceiveErc20Event.token].contract_decimals
    }
  }
}

getSwapTransactions('1', '0x632A84DC35A1e43B8196B2d08630dC9e6a1F3692')
