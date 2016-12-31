# SpiceHours

Hour marking system storing data in Ethereum blockchain.

## Production Setup

Contracts deployed:

| Address                                                                                                               | Name         | Usage                            |
|-----------------------------------------------------------------------------------------------------------------------|--------------|----------------------------------|
| [0x4ed985e2da341e276bbf7782f2e1e30689d33c89](https://etherscan.io/address/0x4ed985e2da341e276bbf7782f2e1e30689d33c89) | SpiceMembers | User management                  |
| [0x2458fa37d7d81e05a65180195413d1db25f761e5](https://etherscan.io/address/0x2458fa37d7d81e05a65180195413d1db25f761e5) | SpiceHours   | Payroll management, hour marking |
| [0x15388e59ce6a854c29d7330a6cf4746312f20af7](https://etherscan.io/address/0x15388e59ce6a854c29d7330a6cf4746312f20af7) | SpiceRates   | Hourly rate management           |

Accounts in use:

| Address                                                                                                               | Level    | Description                       |
|-----------------------------------------------------------------------------------------------------------------------|----------|-----------------------------------|
| [0x9d07fc83a0a68f47ba3e289caa68dd329296123c](https://etherscan.io/address/0x9d07fc83a0a68f47ba3e289caa68dd329296123c) | Owner    | Superuser account                 |
| [0x6b8ba21c8875342f49a9d7b5eb31a0b1df099cd3](https://etherscan.io/address/0x6b8ba21c8875342f49a9d7b5eb31a0b1df099cd3) | Manager  | Manager account for marking hours |
| [0x6799a1d5f574ef1c376f5515ee7e2b8b06b30754](https://etherscan.io/address/0x6799a1d5f574ef1c376f5515ee7e2b8b06b30754) | Director | Director account for local use    |
| [0xf086f7d8e8add5cd3d8788f85f5724655d52923b](https://etherscan.io/address/0xf086f7d8e8add5cd3d8788f85f5724655d52923b) | Director | Director account for MetaMask     |

Architecture diagram:

![SpiceHours Architecture](https://raw.githubusercontent.com/jvah/spicehours/master/doc/SpiceHours-architecture.png)
