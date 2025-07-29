#[test_module]
module sui_flap::suiflap_contract_tests {
    use sui::test_scenario::{Self, Scenario, next_tx};
    use sui::coin::{Self, Coin};
    use sui_flap::suiflap_contract::{
        Self, GameVault, AdminCap, SUIFLAP_CONTRACT,
        get_score, vault_balance, admin
    };

    const ADMIN: address = @0xA;
    const PLAYER_1: address = @0x1;
    const PLAYER_2: address = @0x2;
    const UNAUTHORIZED_USER: address = @0xDEAD;

    fun setup(scenario: &mut Scenario) {
        next_tx(scenario, ADMIN);
        {
            suiflap_contract::init_for_testing(scenario.ctx());
        };
    }

    #[test]
    fun test_init_success() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        next_tx(&mut scenario, ADMIN);
        {
            assert!(test_scenario::has_most_recent_for_sender<AdminCap>(&scenario), 0);
            assert!(test_scenario::has_most_recent_for_sender<coin::TreasuryCap<SUIFLAP_CONTRACT>>(&scenario), 1);

            let vault = test_scenario::take_shared<GameVault>(&scenario);
            // Use the public getter function
            assert!(suiflap_contract::admin(&vault) == ADMIN, 2);
            assert!(vault_balance(&vault) == 0, 3);
            test_scenario::return_shared(vault);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_reward_new_player_success() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = test_scenario::take_from_sender<AdminCap>(&scenario);
            // Make treasury mutable
            let mut treasury = test_scenario::take_from_sender<coin::TreasuryCap<SUIFLAP_CONTRACT>>(&scenario);
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);

            suiflap_contract::reward_player(&admin_cap, &mut treasury, &mut vault, PLAYER_1, 100, 1000, scenario.ctx());
            assert!(get_score(&vault, PLAYER_1) == 100, 0);

            test_scenario::return_to_sender(&scenario, admin_cap);
            test_scenario::return_to_sender(&scenario, treasury);
            test_scenario::return_shared(vault);
        };
        
        next_tx(&mut scenario, PLAYER_1);
        {
            let coin = test_scenario::take_from_sender<Coin<SUIFLAP_CONTRACT>>(&scenario);
            assert!(coin::value(&coin) == 1000, 1);
            test_scenario::return_to_sender(&scenario, coin);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_reward_existing_player_score_logic() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = test_scenario::take_from_sender<AdminCap>(&scenario);
            let mut treasury = test_scenario::take_from_sender<coin::TreasuryCap<SUIFLAP_CONTRACT>>(&scenario);
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);
            suiflap_contract::reward_player(&admin_cap, &mut treasury, &mut vault, PLAYER_1, 50, 500, scenario.ctx());
            assert!(get_score(&vault, PLAYER_1) == 50, 0);
            test_scenario::return_to_sender(&scenario, admin_cap);
            test_scenario::return_to_sender(&scenario, treasury);
            test_scenario::return_shared(vault);
        };

        next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = test_scenario::take_from_sender<AdminCap>(&scenario);
            let mut treasury = test_scenario::take_from_sender<coin::TreasuryCap<SUIFLAP_CONTRACT>>(&scenario);
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);
            suiflap_contract::reward_player(&admin_cap, &mut treasury, &mut vault, PLAYER_1, 100, 1000, scenario.ctx());
            assert!(get_score(&vault, PLAYER_1) == 100, 1);
            test_scenario::return_to_sender(&scenario, admin_cap);
            test_scenario::return_to_sender(&scenario, treasury);
            test_scenario::return_shared(vault);
        };

        next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = test_scenario::take_from_sender<AdminCap>(&scenario);
            let mut treasury = test_scenario::take_from_sender<coin::TreasuryCap<SUIFLAP_CONTRACT>>(&scenario);
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);
            suiflap_contract::reward_player(&admin_cap, &mut treasury, &mut vault, PLAYER_1, 75, 750, scenario.ctx());
            assert!(get_score(&vault, PLAYER_1) == 100, 2); 
            test_scenario::return_to_sender(&scenario, admin_cap);
            test_scenario::return_to_sender(&scenario, treasury);
            test_scenario::return_shared(vault);
        };
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expect_failure(abort_code = 0)]
    fun test_reward_player_unauthorized_fails() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);
        
        next_tx(&mut scenario, UNAUTHORIZED_USER);
        {
            let admin_cap = test_scenario::take_from_address<AdminCap>(&scenario, ADMIN);
            let mut treasury = test_scenario::take_from_address<coin::TreasuryCap<SUIFLAP_CONTRACT>>(&scenario, ADMIN);
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);

            suiflap_contract::reward_player(&admin_cap, &mut treasury, &mut vault, PLAYER_1, 10, 10, scenario.ctx());

            test_scenario::return_to_address(ADMIN, admin_cap);
            test_scenario::return_to_address(ADMIN, treasury);
            test_scenario::return_shared(vault);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_transfer_admin_success() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);
        
        next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);
            suiflap_contract::transfer_admin(&mut vault, PLAYER_1, scenario.ctx());
            assert!(suiflap_contract::admin(&vault) == PLAYER_1, 0);
            test_scenario::return_shared(vault);
        };

        next_tx(&mut scenario, PLAYER_1);
        {
            let admin_cap = test_scenario::take_from_address<AdminCap>(&scenario, ADMIN);
            let mut treasury = test_scenario::take_from_address<coin::TreasuryCap<SUIFLAP_CONTRACT>>(&scenario, ADMIN);
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);
            
            suiflap_contract::reward_player(&admin_cap, &mut treasury, &mut vault, PLAYER_2, 99, 99, scenario.ctx());
            assert!(get_score(&vault, PLAYER_2) == 99, 1);
            
            test_scenario::return_to_address(ADMIN, admin_cap);
            test_scenario::return_to_address(ADMIN, treasury);
            test_scenario::return_shared(vault);
        };
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expect_failure(abort_code = 0)]
    fun test_old_admin_cannot_act_fails() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);
        
        next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);
            suiflap_contract::transfer_admin(&mut vault, PLAYER_1, scenario.ctx());
            test_scenario::return_shared(vault);
        };

        next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = test_scenario::take_from_sender<AdminCap>(&scenario);
            let mut treasury = test_scenario::take_from_sender<coin::TreasuryCap<SUIFLAP_CONTRACT>>(&scenario);
            let mut vault = test_scenario::take_shared<GameVault>(&scenario);
            
            suiflap_contract::reward_player(&admin_cap, &mut treasury, &mut vault, PLAYER_2, 10, 10, scenario.ctx());
            
            test_scenario::return_to_sender(&scenario, admin_cap);
            test_scenario::return_to_sender(&scenario, treasury);
            test_scenario::return_shared(vault);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_get_score_for_non_player() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        next_tx(&mut scenario, ADMIN);
        {
            let vault = test_scenario::take_shared<GameVault>(&scenario);
            assert!(get_score(&vault, PLAYER_2) == 0, 0);
            test_scenario::return_shared(vault);
        };
        test_scenario::end(scenario);
    }
}