// Variables: account = fee payer component_..., split = the Split component_...
fn fee_main() {
    let account = var!["account"];
    account.pay_fee(100000);
}

fn main() {
    let split = var!["split"];
    split.distribute();
}
