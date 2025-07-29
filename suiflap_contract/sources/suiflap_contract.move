#[allow(duplicate_alias)]
module sui_flap::suiflap_contract {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::event::{Self, emit};
    use sui::table::{Self, new, add, contains, borrow, borrow_mut};
    use std::option;

    /// Token marker
    public struct SUIFLAP_CONTRACT has drop {}

    /// Admin capability
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Vault to store token supply and scores
    public struct GameVault has key {
        id: UID,
        balance: Balance<SUIFLAP_CONTRACT>,
        admin: address,
        scores: table::Table<address, u64>, // ✅ address -> score mapping
    }

    /// Mint event
    public struct TokenMinted has copy, drop {
        amount: u64,
        recipient: address,
    }
    public fun admin(vault: &GameVault): address {
        vault.admin
    }
    /// Score update event
    public struct ScoreUpdated has copy, drop {
        player: address,
        score: u64,
    }

    /// Init token and game vault
    fun init(witness: SUIFLAP_CONTRACT, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            8,
            b"SLAP",
            b"SuiFlap Token",
            b"Earn SLAP by scoring in-game",
            option::none(),
            ctx
        );

        transfer::public_freeze_object(metadata);

        let admin_cap = AdminCap { id: object::new(ctx) };

        let score_table = table::new<address, u64>(ctx);

        let vault = GameVault {
            id: object::new(ctx),
            balance: balance::zero(),
            admin: tx_context::sender(ctx),
            scores: score_table,
        };

        transfer::public_transfer(treasury, tx_context::sender(ctx));
        transfer::public_transfer(admin_cap, tx_context::sender(ctx));
        transfer::share_object(vault);
    }

    /// Mint tokens & update score
    public fun reward_player(
        admin_cap: &AdminCap,
        treasury: &mut TreasuryCap<SUIFLAP_CONTRACT>,
        vault: &mut GameVault,
        recipient: address,
        score: u64,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.admin, 0);

        // Mint token
        let minted = coin::mint(treasury, amount, ctx);
        transfer::public_transfer(minted, recipient);
        event::emit(TokenMinted { amount, recipient });

        // Update score
        let has_entry = table::contains(&vault.scores, recipient);
        if (has_entry) {
            let existing = table::borrow_mut(&mut vault.scores, recipient);
            if (*existing < score) {
                *existing = score;
            }
        } else {
            table::add(&mut vault.scores, recipient, score);
        }

        // event::emit(ScoreUpdated { player: recipient, score });
    }

    /// View player's high score
    public fun get_score(vault: &GameVault, player: address): u64 {
        if (table::contains(&vault.scores, player)) {
            *table::borrow(&vault.scores, player)
        } else {
            0
        }
    }

    /// View vault balance
    public fun vault_balance(vault: &GameVault): u64 {
        balance::value(&vault.balance)
    }

    /// Transfer admin
    public fun transfer_admin(vault: &mut GameVault, new_admin: address, ctx: &TxContext) {
        assert!(tx_context::sender(ctx) == vault.admin, 0);
        vault.admin = new_admin;
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(SUIFLAP_CONTRACT {}, ctx);
    }
}
