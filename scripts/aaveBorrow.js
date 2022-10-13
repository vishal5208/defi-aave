const { getNamedAccounts, ethers, network } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")
const { getWETH, AMOUNT } = require("../scripts/getWETH")

async function main() {
    await getWETH()

    const { deployer } = await getNamedAccounts()

    // lending pool address provider : 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    const lendingPool = await getLendingPool(deployer)
    console.log(`LendingPool Addresss : ${lendingPool.address}`)

    // deposite
    const wethTokenAddress = networkConfig[network.config.chainId].wethToken

    // approve
    await approveErc20(wethTokenAddress, deployer, lendingPool.address, AMOUNT)

    //
    // for depositing our collateral
    console.log("Depositing...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("Deposited!")

    // get User data
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)

    // what the conversion rate on Dai is ?
    const daiPrice = await getDaiPrice() // 0.000808447250400687

    // borrow
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber())
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString()) // we need it in wei
    console.log(`You can borrow ${amountDaiToBorrow.toString()} DAI`)

    const daiTokenAddress = networkConfig[network.config.chainId].daiToken
    await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer)

    // updated user data
    console.log("Updated User data after borrowed Dai")
    await getBorrowUserData(lendingPool, deployer)

    // repay
    await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer)
    console.log("Updated user information after repay")
    await getBorrowUserData(lendingPool, deployer)
}

async function repay(amount, daiAddress, lendingPool, account) {
    await approveErc20(daiAddress, account, lendingPool.address, amount)
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
    await repayTx.wait(1)
    console.log("Repaid!")
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account)
    await borrowTx.wait(1)
    console.log("You've borrowed!")
}

async function getDaiPrice() {
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        networkConfig[network.config.chainId].daiEthPriceFeed
    )
    const price = (await daiEthPriceFeed.latestRoundData())[1]
    console.log(`The DAI/ETH price is ${price.toString()}`)
    return price
}

async function getBorrowUserData(lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account)
    console.log(`You have ${totalCollateralETH} worth of ETH deposited.`)
    console.log(`You have ${totalDebtETH} worth of ETH borrowed.`)
    console.log(`You can borrow ${availableBorrowsETH} worth of ETH.`)
    return { availableBorrowsETH, totalDebtETH }
}

// erc20Address -> WEth's contract address(as an asset)
// spenderAddress -> lendingPool as spender(we are approving it to pull our asset)
// signer -> We are the signer
// amount -> how much amount we want to give approval of
async function approveErc20(erc20Address, signer, spenderAddress, amount) {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, signer)
    const tx = await erc20Token.approve(spenderAddress, amount)
    await tx.wait(1)
    console.log("Approved")
}

async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        networkConfig[network.config.chainId].lendingPoolAddressesProvider,
        // "0xb53c1a33016b2dc2ff3653530bff1848a515c8c5",
        account
    )
    const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool()
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)
    return lendingPool
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error()
        process.exit(1)
    })
