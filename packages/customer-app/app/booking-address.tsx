/**
 * Root-stack route for add/edit address from the booking flow.
 * Keeps create-booking under this screen so router.back() returns to booking (with form state).
 * Do not use (tabs)/profile/address-form from create-booking — that switches tab stacks and back() goes home.
 */
import AddressFormScreen from './(tabs)/profile/address-form';

export default AddressFormScreen;
