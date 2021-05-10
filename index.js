const Axios = require('axios').default

/**
 * Fetch transactions which has `Swap` event from given chainId and wallet address.
 * Note: Supported only Ethereum (ChainId: 1) and Binance Smart Chain (ChainId: 56).
 * @param {string} chainId
 * @param {string} address
 * @returns an array with transaction details object
 */
async function getSwapTransactions(chainId, address) {
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
      'page-size': 300 // Number of transactions per page
    }
  })
  .then(result => result.data.data.items)

  // Step 4: Filters out transactions that 'Swap' event didn't exist.
  const _swapTransactions = _transactions.filter(({ log_events }) => log_events.find(({ decoded }) => decoded && decoded.name === 'Swap'))

  // Step 5: Sanitize and format return data
  const swapTransactions = _swapTransactions.map(transaction => {
    const _address = address.toLowerCase()
    // ERC20 Transfer
    if(transaction.value === "0") {
      const sentEvent = transaction.log_events.find(({decoded}) => {
        return decoded && decoded.name === 'Transfer' && decoded.params[0].value === _address
      })
      const receiveErc20Event = transaction.log_events.find(({decoded}) => {
        return decoded && decoded.name === 'Transfer' && decoded.params[1].value === _address
      })

      // Receive ERC20 token
      if(receiveErc20Event) {
        return {
          txHash: transaction.tx_hash,
          gasQuote: transaction.gas_quote,
          timestamp: transaction.block_signed_at,
          fromToken: sentEvent.sender_address,
          fromTokenSymbol: _cacheBalanceTokens[sentEvent.sender_address].contract_ticker_symbol,
          fromTokenAmount: sentEvent.decoded.params[2].value,
          fromTokenDecimal: _cacheBalanceTokens[sentEvent.sender_address].contract_decimals,
          toToken: receiveErc20Event.sender_address,
          toTokenSymbol: _cacheBalanceTokens[receiveErc20Event.sender_address].contract_ticker_symbol,
          toTokenAmount: receiveErc20Event.decoded.params[2].value,
          toTokenDecimal: _cacheBalanceTokens[receiveErc20Event.sender_address].contract_decimals
        }
      } else {
        // Receive ETH
        const receiveEthEvent = transaction.log_events.find(({decoded}) => {
          return decoded && decoded.name === 'Withdrawal'
        })

        return {
          txHash: transaction.tx_hash,
          timestamp: transaction.block_signed_at,
          gasQuote: transaction.gas_quote,
          fromToken: sentEvent.sender_address,
          fromTokenSymbol: _cacheBalanceTokens[sentEvent.sender_address].contract_ticker_symbol,
          fromTokenAmount: sentEvent.decoded.params[2].value,
          fromTokenDecimal: _cacheBalanceTokens[sentEvent.sender_address].contract_decimals,
          toToken: 'ETH',
          toTokenSymbol: 'Ether',
          toTokenAmount: receiveEthEvent.decoded.params[1].value,
          toTokenDecimal: 18
        }
      }
    } else { // ETH Transfer
      const receiveEvent = transaction.log_events.find(({decoded}) => {
        return decoded && decoded.name === 'Transfer' && decoded.params[1].value === _address
      })

      return {
        txHash: transaction.tx_hash,
        gasQuote: transaction.gas_quote,
        timestamp: transaction.block_signed_at,
        fromToken: 'ETH',
        fromTokenSymbol: 'Ether',
        fromTokenAmount: transaction.value,
        fronTokenDecimals: 18,
        toToken: receiveEvent.sender_address,
        toTokenAmount: receiveEvent.decoded.params[2].value,
        toTokenSymbol: _cacheBalanceTokens[receiveEvent.sender_address].contract_ticker_symbol,
        toTokenDecimal: _cacheBalanceTokens[receiveEvent.sender_address].contract_decimals
      }
    }
  })

  console.log(JSON.stringify(swapTransactions))
}

getSwapTransactions('1', '0x632A84DC35A1e43B8196B2d08630dC9e6a1F3692')
