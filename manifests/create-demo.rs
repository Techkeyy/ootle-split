// Manifest page. Variable: account = component_bbec55ccd1f4191208a4cb572e87a5b54eeb9c476f200cc12eda5ee26a26a0fc
use template_6494a4fe7ea2de9276aada3b77086dfc14242fe4b96629a694745b24e49fb2d2 as Split;

fn fee_main() {
    let account = var!["account"];
    account.pay_fee(100000);
}

fn main() {
    Split::new("Ootle Split Demo", [address!("component_bbec55ccd1f4191208a4cb572e87a5b54eeb9c476f200cc12eda5ee26a26a0fc")], [10000u32]);
}
