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
  const chainTokenSymbol = chainId === '1' ? 'ETH' : 'BNB'
  // Covalent API returns a lower-case address. We have to make sure user-input address is also lowered case.
  const _address = address.toLowerCase()

  // Step 1: Fetches token details for given wallet address
  const _balances = await Axios.get(`https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/`, {
    params: {
      'no-nft-fetch': true
    }
  }).then(result => result.data.data.items)

  // Step 2: Cache token balance
  const _cacheBalanceTokens = []
  for(const balance of _balances) {
    _cacheBalanceTokens[balance.contract_address] = balance
  }

  // Step 3: Fetches transaction history from given chainId and address
  const _transactions = await Axios.get(`https://api.covalenthq.com/v1/${chainId}/address/${address}/transactions_v2/`, {
    params: {
      'page-size': 500 // Number of transactions per page
    }
  })
  .then(result => result.data.data.items)

  // Step 4: Filtering transactions in the following cases:
  // 1. Swap event doesn't exist
  // 2. If transaction value = 0, then make sure there's transfer event from sender
  // 3. If transaction value != 0, then make sure there's transfer event to sender
  const _swapTransactions = _transactions.filter(({ log_events, value }) => {
    const swapTx = log_events.find(({ decoded }) => decoded && decoded.name === 'Swap')

    if(swapTx){
      if(value === '0') {
        return log_events.find(({decoded}) => decoded && decoded.name === 'Transfer' && decoded.params[0].value === _address)
      } else {
        return log_events.find(({decoded}) => decoded && decoded.name === 'Transfer' && decoded.params[1].value === _address)
      }
    }
  })

  // Step 5: Sanitize and format return data
  const swapTransactions = _swapTransactions.map(transaction => {
    // Swap with ERC20
    if(transaction.value === "0") {
      const sentEvent = transaction.log_events.find(({decoded}) => {
        return decoded && decoded.name === 'Transfer' && decoded.params[0].value === _address
      })
      const receiveErc20Event = transaction.log_events.find(({decoded}) => {
        return decoded && decoded.name === 'Transfer' && decoded.params[1].value === _address
      })

      if (!sentEvent) {
        console.log(JSON.stringify(transaction))
      }

      // Swap ERC20 to ERC20
      if(receiveErc20Event) {
        const fromTokenSymbol = _cacheBalanceTokens[sentEvent.sender_address].contract_ticker_symbol
        const fromTokenAmount = sentEvent.decoded.params[2].value
        const fromTokenDecimal = _cacheBalanceTokens[sentEvent.sender_address].contract_decimals
        const toTokenSymbol = _cacheBalanceTokens[receiveErc20Event.sender_address].contract_ticker_symbol
        const toTokenAmount = receiveErc20Event.decoded.params[2].value
        const toTokenDecimal = _cacheBalanceTokens[receiveErc20Event.sender_address].contract_decimals

        return `${chalk.yellowBright('Swapped')} ${chalk.blueBright(fromTokenAmount/(10 ** fromTokenDecimal))} ${chalk.greenBright(fromTokenSymbol)} -> ${chalk.blueBright(toTokenAmount/(10 ** toTokenDecimal))} ${chalk.greenBright(toTokenSymbol)}`
      } else {
        // Swap ERC20 to ETH/BNB
        const receiveEthEvent = transaction.log_events.find(({decoded}) => {
          return decoded && decoded.name === 'Withdrawal'
        })

        const fromTokenSymbol = _cacheBalanceTokens[sentEvent.sender_address].contract_ticker_symbol
        const fromTokenAmount = sentEvent.decoded.params[2].value
        const fromTokenDecimal = _cacheBalanceTokens[sentEvent.sender_address].contract_decimals
        const toTokenSymbol = chainTokenSymbol
        const toTokenAmount = receiveEthEvent.decoded.params[1].value
        const toTokenDecimal = 18

        return `${chalk.yellowBright('Swapped')} ${chalk.blueBright(fromTokenAmount/(10 ** fromTokenDecimal))} ${chalk.greenBright(fromTokenSymbol)} -> ${chalk.blueBright(toTokenAmount/(10 ** toTokenDecimal))} ${chalk.greenBright(toTokenSymbol)}`
      }
    } else {
      // Swap ETH/BNB to ERC20
      const receiveEvent = transaction.log_events.find(({decoded}) => {
        return decoded && decoded.name === 'Transfer' && decoded.params[1].value === _address
      })

      const fromTokenSymbol = chainTokenSymbol
      const fromTokenAmount = transaction.value
      const fromTokenDecimal = 18
      const toTokenAmount = receiveEvent.decoded.params[2].value
      const toTokenSymbol = _cacheBalanceTokens[receiveEvent.sender_address].contract_ticker_symbol
      const toTokenDecimal = _cacheBalanceTokens[receiveEvent.sender_address].contract_decimals

      return `${chalk.yellowBright('Swapped')} ${chalk.blueBright(fromTokenAmount/(10 ** fromTokenDecimal))} ${chalk.greenBright(fromTokenSymbol)} -> ${chalk.blueBright(toTokenAmount/(10 ** toTokenDecimal))} ${chalk.greenBright(toTokenSymbol)}`
    }
  })

  for(const swapTx of swapTransactions) {
    console.log(swapTx)
  }
}

getSwapTransactions('1', '0x632A84DC35A1e43B8196B2d08630dC9e6a1F3692')
