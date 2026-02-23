Feature: Sauce Demo Login
  As a user
  I want to log in to Sauce Demo
  So that I can access the inventory page

  @only
  Scenario: Standard user logs in successfully
    Given I am on "https://www.saucedemo.com"
    When I type "standard_user" into "Username"
    And I type "secret_sauce" into "Password"
    And I click "Login"
    Then I should see "Products"
    And the URL should contain "inventory"
