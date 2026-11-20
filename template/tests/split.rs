use tari_template_lib::prelude::*;
use tari_template_test_tooling::{
    TemplateTest, crypto::RistrettoSecretKey, support::assert_error::assert_reject_reason, transaction::args,
};

macro_rules! get {
    ($f:expr, $t:ty, $m:expr) => {
        $f.engine.call_method::<$t>($f.split, $m, args![], vec![])
    };
}

struct Fixture {
    engine: TemplateTest,
    split: ComponentAddress,
    funder: ComponentAddress,
    funder_proof: NonFungibleAddress,
    funder_secret: RistrettoSecretKey,
    alice: ComponentAddress,
    bob: ComponentAddress,
    carol: ComponentAddress,
}

fn balance_of(engine: &mut TemplateTest, account: ComponentAddress) -> Amount {
    engine.call_method(account, "balance", args![TARI_TOKEN], vec![])
}

impl Fixture {
    /// 50% / 30% / 20% split between three empty accounts.
    fn new() -> Self {
        let mut engine = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["."]);
        let (funder, funder_proof, funder_secret) = engine.create_funded_account();
        let (alice, _, _) = engine.create_empty_account();
        let (bob, _, _) = engine.create_empty_account();
        let (carol, _, _) = engine.create_empty_account();
        let split: ComponentAddress = engine.call_function(
            "Split",
            "new",
            args!["Team Prize".to_string(), vec![alice, bob, carol], vec![5000u32, 3000u32, 2000u32]],
            vec![],
        );
        Self { engine, split, funder, funder_proof, funder_secret, alice, bob, carol }
    }

    fn deposit(&mut self, amount: u64) {
        let tx = self
            .engine
            .transaction()
            .call_method(self.funder, "withdraw", args![TARI_TOKEN, Amount::from(amount)])
            .put_last_instruction_output_on_workspace("funds")
            .call_method(self.split, "deposit", args![Workspace("funds")])
            .build_and_seal(&self.funder_secret);
        self.engine.execute_expect_success(tx, vec![self.funder_proof.clone()]);
    }

    fn distribute(&mut self) -> Amount {
        // Anyone may call distribute: use a stranger's key with no badges.
        let (_, _, stranger) = self.engine.create_empty_account();
        let tx = self.engine.transaction().call_method(self.split, "distribute", args![]).build_and_seal(&stranger);
        let before = get!(self, Amount, "total_distributed");
        self.engine.execute_expect_success(tx, vec![]);
        let after = get!(self, Amount, "total_distributed");
        after.checked_sub(before).unwrap()
    }

}

#[test]
fn deposit_and_distribute_pro_rata_with_dust_kept() {
    let mut f = Fixture::new();
    f.deposit(1001);
    assert_eq!(get!(f, Amount, "balance"), Amount::from(1001u64));
    let paid = f.distribute();
    // 1001 * 0.5 = 500, * 0.3 = 300, * 0.2 = 200 -> 1000 paid, 1 dust kept
    assert_eq!(paid, Amount::from(1000u64));
    let (a, b, c) = (f.alice, f.bob, f.carol);
    assert_eq!(balance_of(&mut f.engine, a), Amount::from(500u64));
    assert_eq!(balance_of(&mut f.engine, b), Amount::from(300u64));
    assert_eq!(balance_of(&mut f.engine, c), Amount::from(200u64));
    assert_eq!(get!(f, Amount, "balance"), Amount::from(1u64));
    assert_eq!(get!(f, Amount, "total_distributed"), Amount::from(1000u64));
    assert_eq!(get!(f, Amount, "total_deposited"), Amount::from(1001u64));
    assert_eq!(get!(f, u64, "distributions"), 1);

    // Second round includes the leftover dust.
    f.deposit(9);
    assert_eq!(f.distribute(), Amount::from(10u64));
    assert_eq!(balance_of(&mut f.engine, a), Amount::from(505u64));
    assert_eq!(get!(f, Amount, "balance"), Amount::zero());
    assert_eq!(get!(f, Amount, "total_distributed"), Amount::from(1010u64));
    println!("PROOF alice=505 bob=303 carol=202 dust=0 rounds=2");
}

#[test]
fn recipients_and_label_are_readable() {
    let mut f = Fixture::new();
    let r = get!(f, Vec<(ComponentAddress, u32)>, "recipients");
    assert_eq!(r, vec![(f.alice, 5000), (f.bob, 3000), (f.carol, 2000)]);
    assert_eq!(get!(f, String, "label"), "Team Prize");
}

#[test]
fn empty_split_cannot_distribute() {
    let mut f = Fixture::new();
    let (_, _, stranger) = f.engine.create_empty_account();
    let tx = f.engine.transaction().call_method(f.split, "distribute", args![]).build_and_seal(&stranger);
    assert_reject_reason(f.engine.execute_expect_failure(tx, vec![]), "NothingToDistribute");
}

#[test]
fn invalid_shares_are_rejected() {
    let mut f = Fixture::new();
    let (a, b) = (f.alice, f.bob);
    let cases: Vec<(Vec<ComponentAddress>, Vec<u32>, &str)> = vec![
        (vec![a, b], vec![5000, 4999], "SharesMustSumTo10000"),
        (vec![a, b], vec![10000], "SharesLengthMismatch"),
        (vec![a, a], vec![5000, 5000], "DuplicateRecipient"),
        (vec![a, b], vec![10000, 0], "ZeroShare"),
        (vec![], vec![], "NoRecipients"),
    ];
    let (_, _, key) = f.engine.create_empty_account();
    for (recipients, shares, reason) in cases {
        let tx = f
            .engine
            .transaction()
            .call_function(f.engine.get_template_address("Split"), "new", args!["x".to_string(), recipients, shares])
            .build_and_seal(&key);
        assert_reject_reason(f.engine.execute_expect_failure(tx, vec![]), reason);
    }
}
