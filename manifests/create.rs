// Paste into the wallet app's Manifest page. Set variable: account = your component_... address.
// Replace the template hex and recipient component addresses. Shares are basis points summing to 10000.
use template_PUBLISHED_TEMPLATE_HEX as Split;

fn fee_main() {
    let account = var!["account"];
    account.pay_fee(100000);
}

fn main() {
    Split::new(
        "Team Prize",
        [address!("component_RECIPIENT_A"), address!("component_RECIPIENT_B")],
        [5000u32, 5000u32],
    );
}
