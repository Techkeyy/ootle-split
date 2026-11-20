// Variables: account = your component_..., split = the Split component_...
// Deposits 1 TARI (1,000,000 microTARI) from your account's public balance.
fn fee_main() {
    let account = var!["account"];
    account.pay_fee(100000);
}

fn main() {
    let account = var!["account"];
    let split = var!["split"];
    let funds = account.withdraw(TARI, amount!(1000000));
    split.deposit(funds);
}
