export type State<T> = {
  _metadata: {
    account: string;
    region: string;
  };
  _result: T;
  _parameters?: any;
};

export type GenericState = State<any>;
